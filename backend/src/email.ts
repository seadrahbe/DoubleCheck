import { config } from "./config.js";

const { apiKey, from } = config.resend;

// Sends via the Resend API (https://resend.com/docs/api-reference/emails/send-email)
// when RESEND_API_KEY is set; otherwise just logs the message so the rest of the
// flow can still be tested.
export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<{ sent: boolean }> {
  if (!apiKey) {
    console.log(`\n[email] Resend not configured, would have sent to ${to}:\n${subject}\n${text}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${data.message ?? "unknown error"}`);
  console.log(`[email] sent ${data.id} to ${to}`);
  return { sent: true };
}
