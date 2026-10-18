import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

// "Big Fish" is a warm, calm security guide shown when a log-in is flagged. In a
// few gentle exchanges it tries to tell whether the sign-in is the customer's own
// free choice. It never interrogates: short, kind, respecting the person's
// agency. It reaches one of three outcomes and then stops:
//   - proceed:   looks like the customer's own willing login → share observations, let them continue
//   - extortion: the customer is being extorted/coerced → connect to support, block the login
//   - not_me:    the login wasn't started by the customer → lock the account

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LoginContext {
  location: string;
  ip: string;
}

export type BigFishAction = "continue" | "proceed" | "extortion" | "not_me";

export interface BigFishResult {
  message: string;
  action: BigFishAction;
  suggestions: string[]; // dynamic one-tap replies for the user's next turn
  live: boolean; // true = from Claude, false = scripted fallback
}

const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

const SYSTEM = `You are "Big Fish", a warm, calm safety guide for ${config.bankName}. A log-in to the customer's account was just flagged as unusual, and you're having a short chat to make sure the customer is safe and that this is really them choosing to log in.

Your voice:
- Kind, respectful, and unhurried. Treat the customer as the account's rightful owner, not a suspect.
- Stay neutral and matter-of-fact. Do NOT presume how they feel or imply they might think otherwise — avoid phrases like "you're not in trouble", "don't worry", or "this isn't your fault" unless they first express that worry.
- Respect their agency. It is their account and their decision. You help and explain; you never pressure, lecture, or demand.
- Gentle explanations over questions. When you do ask, ask ONE simple question at a time, and only when you genuinely need it. Never fire several questions in a row or make it feel like an interrogation.
- Short, plain language (2-3 sentences). Many customers are older or shaken.

What you're trying to understand, over about three short exchanges:
- Is the customer the one choosing to log in, of their own free will?
- Is anyone directing, pressuring, threatening, or deceiving them (a "partner" they've never met in person, a "support agent"/"official" on the phone, urgency, a promised prize/refund/investment, or a demand to move money or share a code)?

Reach a conclusion within roughly three exchanges unless something is clearly wrong — do not keep probing once things seem fine. Err toward respecting the customer: if there are no red flags, let them proceed.

Never reveal or hint at a verification/MFA code, and never explain how to finish logging in — the app handles that.

Respond with ONLY a JSON object (no markdown, no prose around it) of this exact shape:
{
  "message": "what you say to the customer, warm and brief",
  "action": "continue" | "proceed" | "extortion" | "not_me",
  "suggestions": ["up to 3 short, first-person replies the customer might tap, written in their voice and specific to what you just said"]
}

Choosing "action":
- "continue": you're still gently understanding the situation. Include a gentle question OR a reassurance in "message", and 2-3 fitting "suggestions".
- "proceed": you're reasonably satisfied this is their own, willing login. In "message", briefly share what you noticed and reassure them, then let them continue. "suggestions" should include a way to continue (e.g. "Yes, take me to sign in") and an out (e.g. "Actually, something feels off").
- "extortion": there are real signs the customer is being extorted, blackmailed, threatened (including threats to share intimate images), or coerced. In "message", gently explain you're connecting them with the ${config.bankName} support team and pausing this login, and suggest contacting local police if they're being threatened. Keep it calm and neutral. This ENDS the chat, so "suggestions" must be [].
- "not_me": the customer indicates they did not start this login (someone else is trying to get in, or they didn't attempt it). In "message", gently explain you're locking the account to protect it and support will help them regain access. This ENDS the chat, so "suggestions" must be [].

Only choose "extortion" or "not_me" on real signals — not for ordinary questions or nerves.`;

// --- Scripted fallback (no API key) ---------------------------------------
const EXTORTION_SIGNS =
  /\b(extort|blackmail|sextort|threaten(ing|ed)?|intimate|nude photo|nude pic|leak( my)? photo|share (my )?(photos|pictures|images)|post (my )?(photos|pictures)|or (they|he|she)('?ll| will) (post|share|send)|pay (them|him|her) or|hostage|ransom)\b/i;
const NOT_ME_SIGNS =
  /\b(wasn'?t me|was not me|didn'?t (try|start|attempt|log)|not me|someone else|i did ?n'?t log|that'?s not me|no,? it wasn'?t)\b/i;

function scriptedReply(messages: ChatMessage[]): Omit<BigFishResult, "live"> {
  const userTurns = messages.filter((m) => m.role === "user");
  const last = userTurns.at(-1)?.content.toLowerCase() ?? "";

  if (EXTORTION_SIGNS.test(last)) {
    return {
      message:
        `I'm concerned for your safety here. I'm connecting you with the ${config.bankName} support team now and pausing this login. If someone is threatening you, please contact your local police — support can take it from here.`,
      action: "extortion",
      suggestions: [],
    };
  }
  if (NOT_ME_SIGNS.test(last)) {
    return {
      message:
        `Thank you for telling me — that's exactly what I needed to know. Since this login wasn't you, I'm locking your account to protect it, and ${config.bankName} support will help you get back in safely.`,
      action: "not_me",
      suggestions: [],
    };
  }
  if (last.includes("real") && (last.includes("call") || last.includes("phone"))) {
    return {
      message:
        "Good question. Your real bank will never rush you, ask for a code you got by text, or tell you to move money to keep it safe. If a call feels urgent or scary, it's okay to hang up and call the number on your card.",
      action: "continue",
      suggestions: ["That makes sense", "Someone is on the phone with me now", "It's just me, I'm logging in"],
    };
  }
  // Pace by turn: gentle check first, then let them proceed if nothing's wrong.
  if (userTurns.length >= 2) {
    return {
      message:
        "Thank you — nothing here worries me, and it sounds like this is you. I just wanted to make sure no one was pressuring you. Whenever you're ready, you can continue to sign in.",
      action: "proceed",
      suggestions: ["Yes, take me to sign in", "Actually, something feels off"],
    };
  }
  return {
    message:
      "Thanks for being here — there's no rush. Is this you choosing to log in, or did someone ask or tell you to?",
    action: "continue",
    suggestions: ["It's me, I'm logging in", "Someone asked me to", "I'm not sure"],
  };
}

// --- Parsing the model's JSON ---------------------------------------------
const ACTIONS: BigFishAction[] = ["continue", "proceed", "extortion", "not_me"];

function parseResult(raw: string): Omit<BigFishResult, "live"> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : "";
  const action = ACTIONS.includes(o.action as BigFishAction) ? (o.action as BigFishAction) : "continue";
  const suggestions = Array.isArray(o.suggestions)
    ? o.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
    : [];
  if (!message) return null;
  return { message, action, suggestions: action === "extortion" || action === "not_me" ? [] : suggestions };
}

// Returns Big Fish's next turn. Uses Claude when ANTHROPIC_API_KEY is set,
// otherwise a scripted fallback so the flow still works.
export async function bigFishReply(ctx: LoginContext, messages: ChatMessage[]): Promise<BigFishResult> {
  if (!client) return { ...scriptedReply(messages), live: false };

  const exchanges = messages.filter((m) => m.role === "user").length;
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 600,
    output_config: { effort: "low" },
    system:
      `${SYSTEM}\n\nThe flagged log-in came from ${ctx.location} (IP ${ctx.ip}); mention it only if it helps. ` +
      `The customer has sent ${exchanges} message(s) so far — by around the third exchange, reach "proceed" unless there are red flags, rather than asking more questions.`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const parsed = parseResult(raw);
  if (!parsed) return { ...scriptedReply(messages), live: true };
  return { ...parsed, live: true };
}
