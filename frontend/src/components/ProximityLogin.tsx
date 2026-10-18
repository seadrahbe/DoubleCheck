import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { APP_NAME } from '../brand'
import { bluetoothUnsupportedReason, checkProximity } from '../bluetooth'

type State =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'not-found' } // filtered chooser closed empty: offer the full device list
  | { step: 'fallback'; reason: string }

export interface SignedInInfo {
  email: string
  deviceName: string
  method: 'broadcast' | 'connection'
  at: Date
}

interface Props {
  onSignedIn: (info: SignedInInfo) => void
  onFallback: () => Promise<void>
}

// Mock bank sign-in. Instead of a password step, it confirms the user's phone is
// nearby over Bluetooth: they open their banking app (which starts broadcasting)
// and the browser reads its rotating code. Not nearby → the DoubleCheck survey.
export default function ProximityLogin({ onSignedIn, onFallback }: Props) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const [email, setEmail] = useState('demo@northwind.example')
  const unsupported = bluetoothUnsupportedReason()

  async function fallBack(reason: string) {
    setState({ step: 'fallback', reason })
    await onFallback()
  }

  // Both callers are click handlers, and nothing is awaited before
  // checkProximity: the Bluetooth chooser needs the click's user gesture.
  async function attempt(showAllDevices: boolean) {
    setState({ step: 'checking' })
    const proximity = await checkProximity({ showAllDevices })
    if (!proximity.ok) {
      if (proximity.reason === 'cancelled' && !showAllDevices) {
        setState({ step: 'not-found' })
        return
      }
      await fallBack(proximity.message)
      return
    }
    try {
      const res = await api.verifyProximity(proximity.proof)
      if (res.result === 'approved') {
        setState({ step: 'idle' })
        onSignedIn({ email, deviceName: proximity.deviceName, method: proximity.method, at: new Date() })
      } else {
        await fallBack(
          res.reason === 'code-used'
            ? 'That code was just used. Wait a moment and try again.'
            : proximity.method === 'broadcast'
              ? "Your phone's code didn't match. Make sure the phone's and computer's clocks are set automatically."
              : `${proximity.deviceName} isn't the phone registered to this account.`,
        )
      }
    } catch (err) {
      await fallBack((err as Error).message)
    }
  }

  function signIn(e: FormEvent) {
    e.preventDefault()
    attempt(false)
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
        <input type="password" defaultValue="hunter22" autoComplete="off" />
      </label>
      <div className="prompt-box">
        <span className="prompt-icon" aria-hidden="true">📲</span>
        <span>
          Open your <strong>{APP_NAME}</strong> on your phone to finish signing in.
        </span>
      </div>
      <button className="primary" type="submit" disabled={state.step === 'checking'}>
        {state.step === 'checking' ? 'Checking your phone is nearby…' : 'Continue'}
      </button>
      {state.step === 'idle' && (
        <p className="muted small-top">
          {unsupported
            ? `Bluetooth isn't available here: ${unsupported} Continuing will send a DoubleCheck survey instead.`
            : `We confirm your phone is nearby over Bluetooth. No code to type — just open the ${APP_NAME}.`}
        </p>
      )}
      {state.step === 'not-found' && (
        <div className="not-found">
          <p className="muted small-top">
            Your phone didn't show up. Make sure the {APP_NAME} is open, then try the full list. iPhones often appear as
            just “iPhone”. No pairing needed: decline any pairing prompt.
          </p>
          <div className="answers">
            <button type="button" className="answer" onClick={() => attempt(true)}>
              Show all nearby devices
            </button>
            <button type="button" className="answer" onClick={() => fallBack('No phone was selected.')}>
              Send me a survey instead
            </button>
          </div>
        </div>
      )}
      {state.step === 'fallback' && (
        <p className="muted small-top">
          Couldn't confirm your phone is nearby ({state.reason}) We've sent you a DoubleCheck survey instead.
        </p>
      )}
    </form>
  )
}
