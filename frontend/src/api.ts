export interface SurveyQuestion {
  id: string
  text: string
}

export interface SurveyInfo {
  location: string
  ip: string
  attemptedAt: string
  progress: number
  questions: SurveyQuestion[]
}

export type Channel = 'sms' | 'email'

export type SurveyResult =
  | { result: 'approved'; code: string }
  | { result: 'not-me' } // user isn't the one logging in
  | { result: 'fraud' } // user looks coached by a scammer; account locked

export type AnswerResponse = SurveyResult | { result: 'next' }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

export const api = {
  triggerLogin: (channel: Channel) =>
    request<{ channel: Channel; sent: boolean; link: string }>('/login-attempts', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  getSurvey: (token: string) => request<SurveyInfo>(`/survey/${encodeURIComponent(token)}`),
  submitAnswer: (token: string, questionId: string, answer: boolean) =>
    request<AnswerResponse>(`/survey/${encodeURIComponent(token)}/answers`, {
      method: 'POST',
      body: JSON.stringify({ questionId, answer }),
    }),
}
