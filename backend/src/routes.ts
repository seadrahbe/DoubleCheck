import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";
import { lookupLocation } from "./geo.js";
import { CODE_PATTERN, matchProximityCode } from "./proximityCode.js";
import { questionsFor } from "./questions.js";
import { sendEmail } from "./email.js";
import { bigFishReply, type ChatMessage } from "./bigfish.js";
import { createAttempt, findAttempt, peekAttempt, type Channel } from "./store.js";

export const router = Router();

const newMfaCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// Hash first so both sides are the same length for timingSafeEqual.
const sha256 = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Simulates a suspicious login: creates a one-time token and sends the survey
// link by text (`{ channel: "sms" }`, the default) or email (`{ channel: "email" }`).
// Once deployed this endpoint is public, so cap how often it can send messages
// (shared across all callers; resets on restart).
const SEND_LIMIT = { perWindow: 20, windowMs: 60 * 60 * 1000, minGapMs: 5000 };
let sendTimes: number[] = [];

function sendAllowed(): boolean {
  const now = Date.now();
  sendTimes = sendTimes.filter((t) => now - t < SEND_LIMIT.windowMs);
  const last = sendTimes.at(-1) ?? 0;
  if (sendTimes.length >= SEND_LIMIT.perWindow || now - last < SEND_LIMIT.minGapMs) return false;
  sendTimes.push(now);
  return true;
}

router.post("/login-attempts", async (req, res) => {
  if (!sendAllowed()) {
    res.status(429).json({ error: "Too many requests. Wait a few seconds and try again." });
    return;
  }
  const channel: Channel = req.body?.channel === "email" ? "email" : "sms";
  const contact = (channel === "email" ? config.myEmail : config.myPhoneNumber) ?? "";
  const ip = config.simulatedLoginIp;
  const location = await lookupLocation(ip);
  const attempt = createAttempt(channel, contact, ip, location);
  const link = `${config.frontendUrl}/survey?token=${attempt.token}`;

  const intro =
    `There has been a new log-in attempt to your account from ${location} (${ip}). ` +
    `This log-in attempt has been flagged as suspicious. ` +
    `Please complete a DoubleCheck survey to proceed:`;

  // Text sending was removed (no Twilio): the "sms" channel just returns the
  // message so the on-screen phone can display it.
  if (channel === "sms") {
    res.status(201).json({ channel, sent: false, link, message: `${intro} ${link}` });
    return;
  }

  // Email (Resend). No recipient configured → log instead of sending.
  if (!contact) {
    console.log(`\n[email] MY_EMAIL not set, would have sent:\n${intro} ${link}\n`);
    res.status(201).json({ channel, sent: false, link, message: `${intro} ${link}` });
    return;
  }
  try {
    const { sent } = await sendEmail(
      contact,
      "Suspicious log-in attempt: DoubleCheck required",
      `${intro} ${link}`,
      `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">Complete your DoubleCheck survey</a></p>` +
        `<p style="color:#666;font-size:13px">This link expires in 10 minutes and can only be used once.</p>`,
    );
    res.status(201).json({ channel, sent, link, message: `${intro} ${link}` });
  } catch (err) {
    console.error(`[email] failed:`, err);
    const reason = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to send email: ${reason}`, link, message: `${intro} ${link}` });
  }
});

// Creates a flagged-login attempt for the on-screen app simulator (and the real
// app): returns the token plus where the suspicious log-in came from.
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
  res.json({ status: attempt.status, method: attempt.method ?? null });
});

// App calls this on a successful Bluetooth or GPS proximity check.
router.post("/session/:token/verify", (req, res) => {
  const attempt = peekAttempt(req.params.token);
  if (!attempt) {
    res.status(404).json({ error: "This login session has expired." });
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
  const code = String(req.body?.code ?? "").replace(/\s/g, "");
  if (attempt.code && code === attempt.code) {
    attempt.status = "approved";
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "That code isn't right. Check your phone and try again." });
  }
});

router.get("/survey/:token", (req, res) => {
  const found = findAttempt(req.params.token);
  if (!found.ok) {
    res.status(found.status).json({ error: found.error });
    return;
  }
  const { attempt } = found;
  res.json({
    location: attempt.location,
    ip: attempt.ip,
    attemptedAt: new Date(attempt.createdAt).toISOString(),
    progress: attempt.progress, // lets a refreshed page resume where it left off
    // Expected answers stay on the server.
    questions: questionsFor(attempt.location).map(({ id, text }) => ({ id, text })),
  });
});

// Answers are checked one at a time, in order, so the survey can stop at the
// first wrong answer without the expected answers ever reaching the browser.
router.post("/survey/:token/answers", (req, res) => {
  const found = findAttempt(req.params.token);
  if (!found.ok) {
    res.status(found.status).json({ error: found.error });
    return;
  }
  const { attempt } = found;
  const { questionId, answer } = req.body ?? {};
  const questions = questionsFor(attempt.location);
  const question = questions[attempt.progress];
  if (typeof answer !== "boolean" || questionId !== question.id) {
    res.status(400).json({ error: "Unexpected answer." });
    return;
  }

  if (answer !== question.expected) {
    attempt.used = true;
    const who = attempt.contact || "unknown user";
    if (question.onWrong === "fraud") {
      console.log(`[survey] suspected fraud (${question.id}) for ${who}: account locked, flag for follow-up`);
    } else {
      console.log(`[survey] ${who} says the log-in attempt wasn't them: attempt blocked`);
    }
    res.json({ result: question.onWrong });
    return;
  }

  attempt.progress++;
  if (attempt.progress < questions.length) {
    res.json({ result: "next" });
    return;
  }
  attempt.used = true;
  res.json({ result: "approved", code: newMfaCode() });
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

// Bluetooth proximity check. The login page gets a proof from the user's
// DoubleCheck Key over Bluetooth, which only works within Bluetooth range, and
// sends it here. A match signs the user in without the survey; anything else
// means the page falls back to sending the survey. Two kinds of proof:
//   - an 8-digit rotating code (DoubleCheck Key app), read from its broadcast
//     name without connecting, or from its characteristic
//   - the static AUTH_DEVICE_KEY (LightBlue / nRF Connect keys)
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
      console.log("[proximity] rotating code verified: DoubleCheck Key nearby, signed in");
      res.json({ result: "approved" });
      return;
    }
    console.log(
      `[proximity] rotating code ${step === null ? "wrong or expired (check both clocks are set automatically)" : "already used"}: falling back to survey`,
    );
    res.json({ result: "mismatch", reason: step === null ? "wrong-code" : "code-used" });
    return;
  }

  if (typeof proof !== "string" || !sameSecret(proof, config.authDeviceKey)) {
    console.log(`[proximity] device key mismatch: falling back to survey. ${describeMismatch(proof, config.authDeviceKey)}`);
    res.json({ result: "mismatch" });
    return;
  }
  console.log("[proximity] static device key verified: DoubleCheck Key nearby, signed in");
  res.json({ result: "approved" });
});

// Big Fish support chat. The app opens this when a log-in is flagged; the token
// ties the conversation to the flagged attempt so Big Fish can cite the location.
// LLM calls cost money and this is public, so cap the rate.
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

  // Location context from the flagged attempt, if the token is still valid.
  const found = findAttempt(req.params.token);
  const ctx = found.ok
    ? { location: found.attempt.location, ip: found.attempt.ip }
    : { location: "an unfamiliar location", ip: "unknown" };

  try {
    const { reply, live } = await bigFishReply(ctx, messages);
    res.json({ reply, live });
  } catch (err) {
    console.error("[bigfish] failed:", err);
    res.status(502).json({ error: "Big Fish couldn't respond. Please try again." });
  }
});
