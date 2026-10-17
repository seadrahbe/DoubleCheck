import nodemailer from "nodemailer";
import { config } from "./config.js";

const { host, port, user, pass, from } = config.smtp;
const transport = host && user && pass
  ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  : null;

// Sends via SMTP when configured; otherwise just logs the message so the
// rest of the flow can still be tested.
export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<{ sent: boolean }> {
  if (!transport) {
    console.log(`\n[email] SMTP not configured, would have sent to ${to}:\n${subject}\n${text}\n`);
    return { sent: false };
  }
  const info = await transport.sendMail({ from: from || user, to, subject, text, html });
  console.log(`[email] sent ${info.messageId} to ${to}`);
  return { sent: true };
}
