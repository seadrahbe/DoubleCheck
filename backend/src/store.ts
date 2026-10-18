import { randomBytes } from "node:crypto";
import { config } from "./config.js";

export type Channel = "sms" | "email" | "app";

// Verification status for the app-driven login handshake:
//   pending  – waiting for the app to verify
//   approved – the app confirmed presence (Bluetooth or GPS), or a typed code matched
//   code     – the app couldn't verify by Bluetooth/GPS, so it issued a code to type
export type SessionStatus = "pending" | "approved" | "code";
export type VerifyMethod = "bluetooth" | "gps" | "code";

export interface LoginAttempt {
  token: string;
  channel: Channel;
  contact: string; // phone number or email address the link was sent to
  ip: string;
  location: string;
  createdAt: number;
  progress: number; // index of the next question to answer
  used: boolean;
  status: SessionStatus;
  method?: VerifyMethod;
  code?: string; // set only when the app falls back to a typed code
}

// In-memory only: everything is lost when the server restarts. Fine for a prototype.
const attempts = new Map<string, LoginAttempt>();

export function createAttempt(channel: Channel, contact: string, ip: string, location: string): LoginAttempt {
  const attempt: LoginAttempt = {
    token: randomBytes(24).toString("base64url"),
    channel,
    contact,
    ip,
    location,
    createdAt: Date.now(),
    progress: 0,
    used: false,
    status: "pending",
  };
  attempts.set(attempt.token, attempt);
  return attempt;
}

export type Lookup =
  | { ok: true; attempt: LoginAttempt }
  | { ok: false; status: number; error: string };

export function findAttempt(token: string): Lookup {
  const attempt = attempts.get(token);
  if (!attempt) return { ok: false, status: 404, error: "This survey link is invalid." };
  if (attempt.used) return { ok: false, status: 410, error: "This survey link has already been used." };
  if (Date.now() - attempt.createdAt > config.tokenTtlMs) {
    return { ok: false, status: 410, error: "This survey link has expired." };
  }
  return { ok: true, attempt };
}

// Like findAttempt but without the one-time "used" gate — for the login session
// handshake, which is polled and mutated repeatedly.
export function peekAttempt(token: string): LoginAttempt | null {
  const attempt = attempts.get(token);
  if (!attempt) return null;
  if (Date.now() - attempt.createdAt > config.tokenTtlMs) return null;
  return attempt;
}
