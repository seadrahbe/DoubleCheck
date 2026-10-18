import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";
import { lookupLocation } from "./geo.js";
import { CODE_PATTERN, matchProximityCode } from "./proximityCode.js";
import { bigFishReply, type ChatMessage } from "./bigfish.js";
import { createAttempt, peekAttempt } from "./store.js";

export const router = Router();

const newMfaCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// Hash first so both sides are the same length for timingSafeEqual.
const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

// Creates a flagged-login attempt for the app flow (the on-screen simulator and
// the native app): returns the token plus where the suspicious log-in came from.
router.post("/flagged-login", async (_req, res) => {
  const ip = config.simulatedLoginIp;
  const location = await lookupLocation(ip);
  const attempt = createAttempt("app", "", ip, location);
  res.status(201).json({ token: attempt.token, location, ip });
});

// --- App-driven login handshake -------------------------------------------
// The web login starts a session (flagged-login above), then polls this while
// the user verifies in the app. The app marks the session verified, or — if it
// can't confirm by Bluetooth or GPS — issues a code the user types on the web.

// Web polls this. Never returns the code itself.
router.get("/session/:token", (req, res) => {
  const attempt = peekAttempt(req.params.token);
  if (!attempt) {
    res.status(404).json({ error: "This login session has expired." });
    return;
  }
  res.json({ status: attempt.status, method: attempt.method ?? null, reason: attempt.blockReason ?? null });
});

// App calls this on a successful Bluetooth or GPS proximity check.
router.post("/session/:token/verify", (req, res) => {
  const attempt = peekAttempt(req.params.token);
  if (!attempt) {
    res.status(404).json({ error: "This login session has expired." });
    return;
  }
  if (attempt.status === "blocked") {
    res.status(409).json({ error: "This login was blocked." });
    return;
  }
  attempt.method = req.body?.method === "gps" ? "gps" : "bluetooth";
  attempt.status = "approved";
  console.log(`[session] verified by ${attempt.method}: login approved`);
  res.json({ ok: true });
});

// App calls this only when Bluetooth and GPS both failed: issues a code for the
// user to read off their phone and type into the web login.
router.post("/issue-code/:token", (req, res) => {
  const attempt = peekAttempt(req.params.token);
  if (!attempt) {
    res.status(404).json({ error: "This login session has expired." });
    return;
  }
  if (attempt.status === "blocked") {
    res.status(409).json({ error: "This login was blocked." });
    return;
  }
  attempt.code = newMfaCode();
  attempt.status = "code";
  attempt.method = "code";
  console.log("[session] Bluetooth and GPS unavailable: issued a one-time code");
  res.json({ code: attempt.code });
});

// Web submits the code the user typed. Approves the session when it matches.
router.post("/session/:token/code", (req, res) => {
  const attempt = peekAttempt(req.params.token);
  if (!attempt) {
    res.status(404).json({ error: "This login session has expired." });
    return;
  }
  if (attempt.status === "blocked") {
    res.status(409).json({ error: "This login was blocked." });
    return;
  }
  const code = String(req.body?.code ?? "").replace(/\s/g, "");
  if (attempt.code && code === attempt.code) {
    attempt.status = "approved";
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "That code isn't right. Check your phone and try again." });
  }
});

// Says what kind of value the key sent without logging the value itself, to
// help debug companion setup (the classic mistake is entering the key as Hex).
function describeMismatch(received: unknown, expected: string): string {
  if (typeof received !== "string" || received === "") return "The key sent an empty value.";
  const base = `Received ${received.length} characters, expected ${expected.length}.`;
  // A key typed into a Hex field arrives as raw bytes, i.e. unprintable characters.
  if (/[^\x20-\x7e]/.test(received)) {
    return `${base} Looks like the key was entered as Hex: set the value format to UTF-8/text instead.`;
  }
  return base;
}

// Bluetooth proximity check for the companion DoubleCheck Key (native app /
// nRF Connect / LightBlue): verifies the rotating code or the static key.
const VERIFY_LIMIT = { perWindow: 10, windowMs: 60 * 1000 };
let verifyTimes: number[] = [];
let lastUsedStep = -1; // rotating codes are single-use

router.post("/proximity/verify", (req, res) => {
  if (!config.authDeviceKey) {
    res.status(503).json({ error: "AUTH_DEVICE_KEY is not set in backend/.env" });
    return;
  }
  // An 8-digit code would be guessable without a cap on attempts.
  const now = Date.now();
  verifyTimes = verifyTimes.filter((t) => now - t < VERIFY_LIMIT.windowMs);
  if (verifyTimes.length >= VERIFY_LIMIT.perWindow) {
    res.status(429).json({ error: "Too many sign-in attempts. Wait a minute and try again." });
    return;
  }
  verifyTimes.push(now);

  const proof: unknown = req.body?.proof ?? req.body?.deviceKey;
  if (typeof proof === "string" && CODE_PATTERN.test(proof)) {
    const step = matchProximityCode(proof, config.authDeviceKey, now);
    if (step !== null && step > lastUsedStep) {
      lastUsedStep = step;
      console.log("[proximity] rotating code verified: DoubleCheck Key nearby");
      res.json({ result: "approved" });
      return;
    }
    console.log(
      `[proximity] rotating code ${step === null ? "wrong or expired (check both clocks are set automatically)" : "already used"}`,
    );
    res.json({ result: "mismatch", reason: step === null ? "wrong-code" : "code-used" });
    return;
  }

  if (typeof proof !== "string" || !sameSecret(proof, config.authDeviceKey)) {
    console.log(`[proximity] device key mismatch. ${describeMismatch(proof, config.authDeviceKey)}`);
    res.json({ result: "mismatch" });
    return;
  }
  console.log("[proximity] static device key verified: DoubleCheck Key nearby");
  res.json({ result: "approved" });
});

// Big Fish support chat. The app opens this when a log-in is flagged; the token
// ties the conversation to the flagged attempt. If Big Fish concludes the person
// is being extorted/coerced, it escalates: the session is blocked and the app
// connects them with support. LLM calls cost money and this is public, so cap
// the rate.
const CHAT_LIMIT = { perWindow: 60, windowMs: 60 * 1000 };
let chatTimes: number[] = [];

router.post("/bigfish/:token", async (req, res) => {
  const now = Date.now();
  chatTimes = chatTimes.filter((t) => now - t < CHAT_LIMIT.windowMs);
  if (chatTimes.length >= CHAT_LIMIT.perWindow) {
    res.status(429).json({ error: "Big Fish is busy right now. Please wait a moment." });
    return;
  }
  chatTimes.push(now);

  const raw: unknown = req.body?.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: "Missing messages." });
    return;
  }
  // Keep only well-formed turns, trim length, and cap how much history we send.
  const messages: ChatMessage[] = raw
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-20);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    res.status(400).json({ error: "The last message must be from the user." });
    return;
  }

  const attempt = peekAttempt(req.params.token);
  const ctx = attempt
    ? { location: attempt.location, ip: attempt.ip }
    : { location: "an unfamiliar location", ip: "unknown" };

  try {
    const { message, action, suggestions, live } = await bigFishReply(ctx, messages);
    if (attempt && (action === "extortion" || action === "not_me")) {
      attempt.status = "blocked";
      attempt.blockReason = action;
      attempt.method = undefined;
      console.log(
        action === "extortion"
          ? "[bigfish] extortion signs detected: login blocked, connecting to support"
          : "[bigfish] customer says this login wasn't them: account locked",
      );
    }
    res.json({ reply: message, action, suggestions, live });
  } catch (err) {
    console.error("[bigfish] failed:", err);
    res.status(502).json({ error: "Big Fish couldn't respond. Please try again." });
  }
});
