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

// Carries the response body so callers can still use what came back with an error.
export class ApiError extends Error {
  data: Record<string, unknown>
  constructor(message: string, data: Record<string, unknown>) {
    super(message)
    this.data = data
  }
}

// Empty in dev (Vite proxies /api to the local backend). In production, set
// VITE_API_URL to the backend's Render URL at build time.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data)
  return data as T
}

export const api = {
  triggerLogin: (channel: Channel) =>
    request<{ channel: Channel; sent: boolean; link: string; message: string }>('/login-attempts', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  verifyProximity: (proof: string) =>
    request<{ result: 'approved' } | { result: 'mismatch'; reason?: 'wrong-code' | 'code-used' }>('/proximity/verify', {
      method: 'POST',
      body: JSON.stringify({ proof }),
    }),
  getSurvey: (token: string) => request<SurveyInfo>(`/survey/${encodeURIComponent(token)}`),
  submitAnswer: (token: string, questionId: string, answer: boolean) =>
    request<AnswerResponse>(`/survey/${encodeURIComponent(token)}/answers`, {
      method: 'POST',
      body: JSON.stringify({ questionId, answer }),
    }),
}
