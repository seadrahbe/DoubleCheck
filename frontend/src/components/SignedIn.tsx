import { BANK_NAME } from '../brand'
import type { SignedInInfo } from './ProximityLogin'

// Where the user lands after the app verifies the flagged login.
const VERIFIED: Record<SignedInInfo['method'], { title: string; detail: (bank: string) => string }> = {
  bluetooth: {
    title: 'Bluetooth proximity',
    detail: (bank) => `Your ${bank} phone was confirmed nearby over Bluetooth, so no one-time code was needed`,
  },
  gps: {
    title: 'your location',
    detail: () => `Your location was confirmed nearby, so no one-time code was needed`,
  },
  code: {
    title: 'a one-time code',
    detail: () => `You entered the one-time code from your app`,
  },
  demo: {
    title: 'the interactive demo',
    detail: () => `Verified through the on-screen walkthrough (not a real proximity check)`,
  },
}

export default function SignedIn({ info, onSignOut }: { info: SignedInInfo; onSignOut: () => void }) {
  const time = info.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const v = VERIFIED[info.method]
  return (
    <section className="card signed-in">
      <div className="success-badge" aria-hidden="true">✓</div>
      <h1>You're signed in</h1>
      <p className="muted">
        Welcome back, <strong>{info.email}</strong>.
      </p>
      <div className="verified">
        <span className="verified-icon" aria-hidden="true">🛡</span>
        <div>
          <strong>Verified by {v.title}</strong>
          <p className="muted small-top">
            {v.detail(BANK_NAME)} at {time}.
          </p>
        </div>
      </div>
      <button className="primary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
