import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { bluetoothUnsupportedReason, checkProximity } from '../bluetooth'

// Demo credentials that count as "correct" for this prototype.
const DEMO_EMAIL = 'demo@northwind.example'
const DEMO_PASSWORD = 'hunter22'

type Stage = 'bluetooth' | 'gps' | 'mfa'

type State =
  | { step: 'creds'; error?: string }
  | { step: 'verifying'; stage: Stage }
  | { step: 'mfa'; code: string }
  | { step: 'error'; message: string }

export interface SignedInInfo {
  email: string
  method: 'bluetooth' | 'gps'
  at: Date
}

// Mock bank sign-in. Correct email + password advances to verification, which
// confirms the account owner is present by the strongest available means:
// Bluetooth proximity → GPS fallback → a one-time MFA code if neither is available.
export default function ProximityLogin({ onSignedIn }: { onSignedIn: (info: SignedInInfo) => void }) {
  const [state, setState] = useState<State>({ step: 'creds' })
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)

  // Called straight from the form submit so the Bluetooth chooser keeps the
  // click's user gesture (requestDevice is the first thing awaited).
  async function verify() {
    // 1. Bluetooth, when the browser supports it.
    if (!bluetoothUnsupportedReason()) {
      setState({ step: 'verifying', stage: 'bluetooth' })
      const proximity = await checkProximity()
      if (proximity.ok) {
        try {
          const res = await api.verifyProximity(proximity.proof)
          if (res.result === 'approved') {
            onSignedIn({ email, method: 'bluetooth', at: new Date() })
            return
          }
        } catch {
          // fall through to GPS
        }
      }
      // Bluetooth available but didn't verify (no phone, cancelled, mismatch) → GPS.
    }

    // 2. GPS fallback.
    if ('geolocation' in navigator) {
      setState({ step: 'verifying', stage: 'gps' })
      const located = await new Promise<boolean>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { timeout: 8000 },
        ),
      )
      if (located) {
        onSignedIn({ email, method: 'gps', at: new Date() })
        return
      }
    }

    // 3. Neither available → one-time MFA code.
    setState({ step: 'verifying', stage: 'mfa' })
    try {
      const { token } = await api.flaggedLogin()
      const { code } = await api.issueCode(token)
      setState({ step: 'mfa', code })
    } catch (err) {
      setState({ step: 'error', message: (err as Error).message })
    }
  }

  function signIn(e: FormEvent) {
    e.preventDefault()
    if (email.trim() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      verify()
    } else {
      setState({ step: 'creds', error: 'Incorrect email or password.' })
    }
  }

  if (state.step === 'verifying') {
    const copy: Record<Stage, string> = {
      bluetooth: 'Confirming your phone is nearby over Bluetooth…',
      gps: 'Bluetooth unavailable. Checking your location…',
      mfa: 'Bluetooth and location unavailable. Sending a one-time code…',
    }
    return (
      <div className="login verify-box">
        <div className="app-spinner" aria-hidden="true" />
        <h2 className="section-title">Verifying it's you</h2>
        <p className="muted small-top">{copy[state.stage]}</p>
      </div>
    )
  }

  if (state.step === 'mfa') {
    return (
      <div className="login">
        <h2 className="section-title">Enter your one-time code</h2>
        <p className="muted">
          We couldn't confirm your phone by Bluetooth or location, so here's a one-time code. Enter it to finish signing
          in, and never share it with anyone.
        </p>
        <p className="code">
          {state.code.slice(0, 3)} {state.code.slice(3)}
        </p>
        <button className="link-button" onClick={() => setState({ step: 'creds' })}>
          Start over
        </button>
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
          After your password, we confirm it's really you — by Bluetooth if your phone is nearby, your location if not,
          or a one-time code as a last resort.
        </p>
      )}
    </form>
  )
}
