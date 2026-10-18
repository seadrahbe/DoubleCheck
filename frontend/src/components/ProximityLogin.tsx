import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { bluetoothUnsupportedReason, checkProximity } from '../bluetooth'

type State =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'approved'; code: string; deviceName: string }
  | { step: 'fallback'; reason: string }

// Mock sign-in form: first tries to find the user's DoubleCheck Key over
// Bluetooth; if it isn't verified nearby, falls back to the DoubleCheck survey.
export default function ProximityLogin({ onFallback }: { onFallback: () => Promise<void> }) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const unsupported = bluetoothUnsupportedReason()

  async function fallBack(reason: string) {
    setState({ step: 'fallback', reason })
    await onFallback()
  }

  async function signIn(e: FormEvent) {
    e.preventDefault()
    setState({ step: 'checking' })
    // No awaits before this: the Bluetooth chooser needs the click's user gesture.
    const proximity = await checkProximity()
    if (!proximity.ok) {
      await fallBack(proximity.message)
      return
    }
    try {
      const res = await api.verifyProximity(proximity.deviceKey)
      if (res.result === 'approved') {
        setState({ step: 'approved', code: res.code, deviceName: proximity.deviceName })
      } else {
        await fallBack(`${proximity.deviceName} isn't the key registered to this account.`)
      }
    } catch (err) {
      await fallBack((err as Error).message)
    }
  }

  if (state.step === 'approved') {
    return (
      <div className="login">
        <h2 className="section-title">Signed in</h2>
        <p className="muted">
          <strong>{state.deviceName}</strong> was found nearby over Bluetooth, so no survey was needed. Your code:
        </p>
        <p className="code">
          {state.code.slice(0, 3)} {state.code.slice(3)}
        </p>
        <button className="link-button" onClick={() => setState({ step: 'idle' })}>
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
        <input type="email" defaultValue="demo@doublecheck.app" autoComplete="off" />
      </label>
      <label>
        Password
        <input type="password" defaultValue="hunter22" autoComplete="off" />
      </label>
      <button className="primary" type="submit" disabled={state.step === 'checking'}>
        {state.step === 'checking' ? 'Looking for your DoubleCheck Key…' : 'Sign in'}
      </button>
      {state.step === 'idle' && (
        <p className="muted small-top">
          {unsupported
            ? `Bluetooth isn't available here: ${unsupported} Signing in will send the survey instead.`
            : 'Signing in checks that your DoubleCheck Key is nearby over Bluetooth.'}
        </p>
      )}
      {state.step === 'fallback' && (
        <p className="muted small-top">
          Couldn't confirm your DoubleCheck Key is nearby ({state.reason}) We've sent you a DoubleCheck survey instead.
        </p>
      )}
    </form>
  )
}
