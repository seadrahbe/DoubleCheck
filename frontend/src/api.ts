export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

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
  // Starts a flagged-login session for the app flow (real app or on-screen simulator).
  flaggedLogin: () => request<{ token: string; location: string; ip: string }>('/flagged-login', { method: 'POST' }),
  // Big Fish support chat. `escalate` means it detected extortion/coercion.
  bigFish: (token: string, messages: ChatTurn[]) =>
    request<{ reply: string; live: boolean; escalate: boolean }>(`/bigfish/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),
  // --- App-driven login handshake ---
  // Web polls the session while the user verifies in the app.
  sessionStatus: (token: string) =>
    request<{ status: 'pending' | 'approved' | 'code' | 'blocked'; method: 'bluetooth' | 'gps' | 'code' | null }>(
      `/session/${encodeURIComponent(token)}`,
    ),
  // App marks the session verified after a Bluetooth or GPS proximity check.
  verifySession: (token: string, method: 'bluetooth' | 'gps') =>
    request<{ ok: true }>(`/session/${encodeURIComponent(token)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    }),
  // App issues a one-time code only when Bluetooth and GPS both failed.
  issueCode: (token: string) =>
    request<{ code: string }>(`/issue-code/${encodeURIComponent(token)}`, { method: 'POST' }),
  // Web submits the code the user read off their phone.
  submitSessionCode: (token: string, code: string) =>
    request<{ ok: true }>(`/session/${encodeURIComponent(token)}/code`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
}
