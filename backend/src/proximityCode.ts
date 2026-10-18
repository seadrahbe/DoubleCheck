import { createHmac } from "node:crypto";

// Rotating proximity code (TOTP, RFC 6238, HMAC-SHA256) that the DoubleCheck Key
// app broadcasts in its Bluetooth name, e.g. "DC-12345678". The login page reads
// it from the device list without connecting, so nothing can trigger pairing.
// Must match companion/ios/DoubleCheckKey/Sources/DoubleCheckKey/ProximityCode.swift.
export const CODE_PERIOD_S = 30;
export const CODE_DIGITS = 8;
export const CODE_PATTERN = /^\d{8}$/;

// The browser's device list can show a name that's a little out of date, so
// accept codes from up to a minute ago (and one step ahead for clock skew).
const STEPS_BEHIND = 2;
const STEPS_AHEAD = 1;

export function proximityCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha256", Buffer.from(secret, "utf8")).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

export const currentStep = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / CODE_PERIOD_S);

// Returns the matching time step, or null. Callers use the step to reject reuse.
export function matchProximityCode(code: string, secret: string, nowMs = Date.now()): number | null {
  if (!CODE_PATTERN.test(code)) return null;
  const now = currentStep(nowMs);
  for (let step = now - STEPS_BEHIND; step <= now + STEPS_AHEAD; step++) {
    if (proximityCode(secret, step) === code) return step;
  }
  return null;
}
