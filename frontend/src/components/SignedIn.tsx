import { BANK_NAME } from '../brand'
import type { SignedInInfo } from './ProximityLogin'

// Where the user lands after their phone is verified nearby: no survey, no
// code, just signed in.
export default function SignedIn({ info, onSignOut }: { info: SignedInInfo; onSignOut: () => void }) {
  const time = info.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
          <strong>Verified by your {BANK_NAME} app</strong>
          <p className="muted small-top">
            Your phone was confirmed nearby over Bluetooth at {time}
            {info.method === 'broadcast' ? ' from a rotating code, with no connection or pairing' : ''}, so this sign-in
            didn't need a DoubleCheck survey.
          </p>
        </div>
      </div>
      <button className="primary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
