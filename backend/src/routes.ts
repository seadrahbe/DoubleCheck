import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { config } from "./config.js";
import { lookupLocation } from "./geo.js";
import { questionsFor } from "./questions.js";
import { sendEmail } from "./email.js";
import { sendSms } from "./sms.js";
import { createAttempt, findAttempt, type Channel } from "./store.js";

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

  // No recipient configured: log instead of sending, like the unconfigured providers do.
  if (!contact) {
    const name = channel === "email" ? "MY_EMAIL" : "MY_PHONE_NUMBER";
    console.log(`\n[${channel}] ${name} not set, would have sent:\n${intro} ${link}\n`);
    res.status(201).json({ channel, sent: false, link, message: `${intro} ${link}` });
    return;
  }

  try {
    const { sent } =
      channel === "email"
        ? await sendEmail(
            contact,
            "Suspicious log-in attempt: DoubleCheck required",
            `${intro} ${link}`,
            `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">Complete your DoubleCheck survey</a></p>` +
              `<p style="color:#666;font-size:13px">This link expires in 10 minutes and can only be used once.</p>`,
          )
        : await sendSms(contact, `${intro} ${link}`);
    res.status(201).json({ channel, sent, link, message: `${intro} ${link}` });
  } catch (err) {
    console.error(`[${channel}] failed:`, err);
    const reason = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: `Failed to send ${channel === "email" ? "email" : "text message"}: ${reason}`,
      link,
      message: `${intro} ${link}`,
    });
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

// Bluetooth proximity check. The login page reads the device key off the user's
// DoubleCheck Key over BLE, which only works within Bluetooth range, and sends it
// here. A match approves the log-in without the survey; anything else means the
// page falls back to sending the survey.
router.post("/proximity/verify", (req, res) => {
  if (!config.authDeviceKey) {
    res.status(503).json({ error: "AUTH_DEVICE_KEY is not set in backend/.env" });
    return;
  }
  const deviceKey: unknown = req.body?.deviceKey;
  if (typeof deviceKey !== "string" || !sameSecret(deviceKey, config.authDeviceKey)) {
    console.log("[proximity] device key mismatch: falling back to survey");
    res.json({ result: "mismatch" });
    return;
  }
  console.log("[proximity] DoubleCheck Key verified nearby: log-in approved");
  res.json({ result: "approved", code: newMfaCode() });
});
