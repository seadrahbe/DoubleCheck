import { useEffect, useState, type FormEvent } from 'react'
import { api, type BlockReason } from '../api'
import { APP_NAME, SUPPORT_NAME, SUPPORT_PHONE } from '../brand'
import { bluetoothUnsupportedReason, pairWithPhone } from '../bluetooth'

// Demo credentials that count as "correct" for this prototype.
const DEMO_EMAIL = 'demo@soundcreditunion.example'
const DEMO_PASSWORD = 'hunter22'

type State =
  | { step: 'creds'; error?: string }
  | { step: 'waiting'; token: string }
  | { step: 'enter-code'; token: string; error?: string }
  | { step: 'blocked'; reason: BlockReason }
  | { step: 'error'; message: string }

export interface SignedInInfo {
  email: string
  method: 'bluetooth' | 'gps' | 'code'
  at: Date
}

interface Props {
  // Hands the started session to the page so the app (phone) can verify it.
  onSession: (token: string, location: string) => void
  onSignedIn: (info: SignedInInfo) => void
}

// Mock bank sign-in. Correct credentials don't log you in directly — the attempt
// is flagged, and you verify in the DoubleCheck app. The web only shows a code
// field if the app can't confirm you by Bluetooth or GPS.
export default function ProximityLogin({ onSession, onSignedIn }: Props) {
  const [state, setState] = useState<State>({ step: 'creds' })
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [codeInput, setCodeInput] = useState('')
  const [pairing, setPairing] = useState(false)
  const [pairError, setPairError] = useState('')
  const bluetoothUnavailable = bluetoothUnsupportedReason()

  // While waiting, poll the session until the app verifies it (or issues a code).
  useEffect(() => {
    if (state.step !== 'waiting') return
    const token = state.token
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const s = await api.sessionStatus(token)
        if (!active) return
        if (s.status === 'approved') {
          onSignedIn({ email, method: s.method === 'gps' || s.method === 'code' ? s.method : 'bluetooth', at: new Date() })
        } else if (s.status === 'code') {
          setState({ step: 'enter-code', token })
        } else if (s.status === 'blocked') {
          setState({ step: 'blocked', reason: s.reason ?? 'extortion' })
        } else {
          timer = setTimeout(poll, 1500)
        }
      } catch (err) {
        if (active) setState({ step: 'error', message: (err as Error).message })
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [state, email, onSignedIn])

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (email.trim() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      setState({ step: 'creds', error: 'Incorrect email or password.' })
      return
    }
    try {
      const fl = await api.flaggedLogin()
      onSession(fl.token, fl.location)
      setState({ step: 'waiting', token: fl.token })
    } catch (err) {
      setState({ step: 'error', message: (err as Error).message })
    }
  }

  // Real Bluetooth pairing, from a click so the chooser keeps the user gesture.
  async function pair(token: string) {
    setPairError('')
    setPairing(true)
    try {
      const res = await pairWithPhone()
      if (!res.ok) {
        // A cancelled chooser just means "not now" — stay on the waiting screen.
        if (res.reason !== 'cancelled') setPairError(res.message)
        return
      }
      await api.sessionBluetooth(token, res.proof)
      onSignedIn({ email, method: 'bluetooth', at: new Date() })
    } catch (err) {
      setPairError((err as Error).message)
    } finally {
      setPairing(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    if (state.step !== 'enter-code') return
    try {
      await api.submitSessionCode(state.token, codeInput)
      onSignedIn({ email, method: 'code', at: new Date() })
    } catch (err) {
      setState({ step: 'enter-code', token: state.token, error: (err as Error).message })
    }
  }

  if (state.step === 'waiting') {
    return (
      <div className="login verify-box">
        <div className="app-spinner" aria-hidden="true" />
        <h2 className="section-title">Verify this sign-in</h2>
        <p className="muted small-top">
          This login was flagged. Open your <strong>{APP_NAME}</strong> on your phone, then pair it to confirm you're
          here. No app? Use the phone on the right to try it.
        </p>
        {bluetoothUnavailable ? (
          <p className="muted small-top">Bluetooth isn't available in this browser: {bluetoothUnavailable}</p>
        ) : (
          <button className="primary" disabled={pairing} onClick={() => pair(state.token)}>
            {pairing ? 'Looking for your phone…' : 'Pair with my phone'}
          </button>
        )}
        {pairError && <p className="error small-top">{pairError}</p>}
      </div>
    )
  }

  if (state.step === 'enter-code') {
    return (
      <form className="login" onSubmit={submitCode}>
        <h2 className="section-title">Enter the code from your app</h2>
        <p className="muted">
          Your app couldn't confirm you by Bluetooth or location, so it's showing a one-time code. Type it here to
          finish signing in.
        </p>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000 000"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          aria-label="One-time code"
        />
        <button className="primary" type="submit" disabled={!codeInput.trim()}>
          Sign in
        </button>
        {state.error && <p className="error small-top">{state.error}</p>}
      </form>
    )
  }

  if (state.step === 'blocked') {
    return (
      <div className="login">
        <h2 className="section-title blocked-title">
          {state.reason === 'extortion' ? 'This sign-in is blocked' : 'Account locked for safety'}
        </h2>
        <p className="muted">
          {state.reason === 'extortion' ? (
            <>
              For your protection, we've paused this login and connected you with <strong>{SUPPORT_NAME}</strong>. A
              specialist will reach out, and you can call them any time at <strong>{SUPPORT_PHONE}</strong>.
            </>
          ) : (
            <>
              Since this login wasn't started by you, we've locked the account to protect it. <strong>{SUPPORT_NAME}</strong>{' '}
              will help you get back in safely — call <strong>{SUPPORT_PHONE}</strong>.
            </>
          )}
        </p>
        <p className="muted small-top">
          If anyone is pressuring or threatening you, please contact local emergency services.
        </p>
      </div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="login">
        <h2 className="section-title">Something went wrong</h2>
        <p className="error">{state.message}</p>
        <button className="link-button" onClick={() => setState({ step: 'creds' })}>
          Start over
        </button>
      </div>
    )
  }

  return (
    <form className="login" onSubmit={signIn}>
      <h2 className="section-title">Sign in</h2>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
      </label>
      <button className="primary" type="submit">
        Sign in
      </button>
      {state.error ? (
        <p className="error small-top">{state.error}</p>
      ) : (
        <p className="muted small-top">
          After your password, flagged sign-ins are verified in the {APP_NAME} — by Bluetooth, your location, or a
          one-time code as a last resort. The code is never shown here.
        </p>
      )}
    </form>
  )
}
