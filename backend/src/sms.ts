import twilio from "twilio";
import { config } from "./config.js";

const { accountSid, authToken, fromNumber } = config.twilio;
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

// Sends via Twilio when configured; otherwise just logs the message so the
// rest of the flow can still be tested.
export async function sendSms(to: string, body: string): Promise<{ sent: boolean }> {
  if (!client || !fromNumber) {
    console.log(`\n[sms] Twilio not configured, would have sent to ${to}:\n${body}\n`);
    return { sent: false };
  }
  const msg = await client.messages.create({ to, from: fromNumber, body });
  console.log(`[sms] sent ${msg.sid} to ${to}`);
  return { sent: true };
}
