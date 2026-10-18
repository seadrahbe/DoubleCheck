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
- You are not a therapist or emergency service. If someone may be in danger, suggest contacting local emergency services or a trusted person.

Escalation:
- If you conclude the person is being extorted, blackmailed, threatened (including sextortion — threats to share intimate images), or coerced by someone into this login or into moving money or sharing codes, then escalate. To escalate, make the very last line of your reply exactly:
  [[ESCALATE]]
  Output that token on its own line, nothing after it, and never explain or mention the token itself.
- In that same reply, gently tell them you're connecting them with the ${config.bankName} support team and pausing this login to keep them safe, reassure them it's not their fault, and, if anyone is threatening them, suggest contacting local law enforcement.
- Only escalate when there are real signs of extortion or coercion — not for ordinary questions or when the person is simply the one logging in.`;

// Scripted replies so the demo works with no API key configured. Matched loosely
// against the user's latest message / the fixed option chips.
const ESCALATE_MARKER = "[[ESCALATE]]";

// Signs of extortion/coercion in the user's own words, for the scripted fallback
// (the live model decides for itself and emits the marker).
const EXTORTION_SIGNS =
  /\b(extort|blackmail|sextort|threaten(ing|ed)?|intimate|nude photo|nude pic|leak( my)? photo|share (my )?(photos|pictures|images)|post (my )?(photos|pictures)|or (they|he|she)('?ll| will) (post|share|send)|pay (them|him|her) or|hostage|ransom)\b/i;

function scriptedReply(messages: ChatMessage[]): { reply: string; escalate: boolean } {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content.toLowerCase() ?? "";
  if (EXTORTION_SIGNS.test(last)) {
    return {
      reply:
        `I'm really concerned for your safety, and I want you to know none of this is your fault. ` +
        `I'm connecting you with the ${config.bankName} support team now and pausing this login to keep you safe. ` +
        `If someone is threatening you, please contact your local police. You don't have to face this alone.`,
      escalate: true,
    };
  }
  if (last.includes("real") && (last.includes("call") || last.includes("phone"))) {
    return {
      reply:
        "Good question. Your real bank will never rush you, ask for a code you received by text, or tell you to move money to keep it safe. If a call feels urgent or scary, hang up and call the number on the back of your card.",
      escalate: false,
    };
  }
  if (last.includes("romantic") || last.includes("romance") || last.includes("extortion")) {
    return {
      reply:
        "Some warning signs: someone you met online you haven't met in person, who professes strong feelings quickly, avoids video calls, and then asks for money, gift cards, or your codes — or threatens to share private images. None of that is your fault. It can help to talk it over with someone you trust before doing anything.",
      escalate: false,
    };
  }
  if (last.includes("support") || last.includes("help") || last.includes("scared") || last.includes("worried")) {
    return {
      reply:
        "I'm really glad you're here, and you're not in trouble. Take a breath. Can you tell me a little about what's going on — is anyone helping you or telling you what to do with this log-in right now?",
      escalate: false,
    };
  }
  return {
    reply:
      "Thanks for letting me know. There's no rush here. Is anyone on a call or messaging you right now about this log-in, or asking you to share a code or move money?",
    escalate: false,
  };
}

// Returns Big Fish's next reply, plus whether to escalate (block the login and
// connect to support). Uses Claude when ANTHROPIC_API_KEY is set, otherwise a
// scripted fallback so the flow still works.
export async function bigFishReply(
  ctx: LoginContext,
  messages: ChatMessage[],
): Promise<{ reply: string; live: boolean; escalate: boolean }> {
  if (!client) return { ...scriptedReply(messages), live: false };

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 600,
    output_config: { effort: "low" },
    system: `${SYSTEM}\n\nThe flagged log-in came from ${ctx.location} (IP ${ctx.ip}). Mention this naturally if it helps them judge whether it was really them.`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const escalate = raw.includes(ESCALATE_MARKER);
  const reply = raw.replaceAll(ESCALATE_MARKER, "").trim();
  if (!reply) return { ...scriptedReply(messages), live: true };
  return { reply, live: true, escalate };
}
