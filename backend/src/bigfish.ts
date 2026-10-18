import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

// "Big Fish" is a calm, supportive security guide shown when a log-in is flagged.
// Its job is to gently check whether the person is being coached or pressured by
// a scammer, give plain-language safety help, and never hand over codes or rush a
// log-in. The actual verification (Bluetooth/GPS/code) is handled elsewhere; Big
// Fish only talks.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LoginContext {
  location: string;
  ip: string;
}

const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

const SYSTEM = `You are "Big Fish", a warm, calm security guide for a bank's account-protection team. A log-in to the customer's account was just flagged as suspicious. You are talking with the customer to make sure they are safe before they continue.

Your goals, in order:
1. Reassure them. They are not in trouble. This is a safety check.
2. Gently notice signs that someone else may be directing them (a romance or "partner" they haven't met in person, a "support agent" or "government official" on the phone, pressure to act fast, a promised prize/refund/investment, a request to move money or share a code). Explore with open, non-judgmental questions. Never accuse or shame them.
3. When they ask, give short, concrete safety help (how to tell if a call is really from their bank, warning signs of romance or sextortion scams, what to do next).
4. Encourage them to slow down and check with someone they trust, and to contact their bank only through the number on their card.

Hard rules:
- Never provide, read out, or hint at a verification/MFA code. You do not have it.
- Never tell them how to finish logging in. If they decide to proceed, tell them to use the "I'd like to log in and access my account" button; the app verifies them, not you.
- If they describe being pressured to move money or share a code right now, gently urge them to stop and not act until they've spoken to someone they trust or the police.
- Keep replies short (2-4 short sentences), plain, and kind. Many customers are older or distressed. No jargon, no lists unless they ask "what are the signs".
- You are not a therapist or emergency service. If someone may be in danger, suggest contacting local emergency services or a trusted person.`;

// Scripted replies so the demo works with no API key configured. Matched loosely
// against the user's latest message / the fixed option chips.
function scriptedReply(messages: ChatMessage[]): string {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content.toLowerCase() ?? "";
  if (last.includes("real") && (last.includes("call") || last.includes("phone"))) {
    return "Good question. Your real bank will never rush you, ask for a code you received by text, or tell you to move money to keep it safe. If a call feels urgent or scary, hang up and call the number on the back of your card.";
  }
  if (last.includes("romantic") || last.includes("romance") || last.includes("extortion")) {
    return "Some warning signs: someone you met online you haven't met in person, who professes strong feelings quickly, avoids video calls, and then asks for money, gift cards, or your codes — or threatens to share private images. None of that is your fault. It can help to talk it over with someone you trust before doing anything.";
  }
  if (last.includes("support") || last.includes("help") || last.includes("scared") || last.includes("worried")) {
    return "I'm really glad you're here, and you're not in trouble. Take a breath. Can you tell me a little about what's going on — is anyone helping you or telling you what to do with this log-in right now?";
  }
  return "Thanks for letting me know. There's no rush here. Is anyone on a call or messaging you right now about this log-in, or asking you to share a code or move money?";
}

// Returns Big Fish's next reply. Uses Claude when ANTHROPIC_API_KEY is set,
// otherwise a scripted fallback so the flow still works.
export async function bigFishReply(ctx: LoginContext, messages: ChatMessage[]): Promise<{ reply: string; live: boolean }> {
  if (!client) return { reply: scriptedReply(messages), live: false };

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 600,
    output_config: { effort: "low" },
    system: `${SYSTEM}\n\nThe flagged log-in came from ${ctx.location} (IP ${ctx.ip}). Mention this naturally if it helps them judge whether it was really them.`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { reply: reply || scriptedReply(messages), live: true };
}
