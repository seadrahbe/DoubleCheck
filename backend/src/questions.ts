// What happens when a question gets the unexpected answer. The survey stops there.
//   not-me: the user isn't the one logging in, so point them to account-security resources.
//   fraud:  the user is likely being coached by a scammer, so lock the account and follow up.
export type FailOutcome = "not-me" | "fraud";

export interface Question {
  id: string;
  text: string;
  expected: boolean; // the answer a legitimate, un-coached user would give
  onWrong: FailOutcome;
}

// `{location}` is filled in with the login attempt's location.
const QUESTIONS: Question[] = [
  {
    id: "self-initiated",
    text: "Are you trying to log in to your account right now?",
    expected: true,
    onWrong: "not-me",
  },
  {
    id: "on-call",
    text: "Is anyone on the phone, in a chat, or on a video call with you telling you what to do?",
    expected: false,
    onWrong: "fraud",
  },
  {
    id: "asked-to-share",
    text: "Did someone ask you to complete this survey or to share a code with them?",
    expected: false,
    onWrong: "fraud",
  },
  {
    id: "urgency",
    text: "Has anyone told you that your account, money, or a family member is in danger and you must act quickly?",
    expected: false,
    onWrong: "fraud",
  },
  {
    id: "reward",
    text: "Were you promised a prize, refund, job, or payment in exchange for logging in?",
    expected: false,
    onWrong: "fraud",
  },
];

export function questionsFor(location: string): Question[] {
  return QUESTIONS.map((q) => ({ ...q, text: q.text.replace("{location}", location) }));
}
