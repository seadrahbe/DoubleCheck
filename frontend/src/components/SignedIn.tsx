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
          <strong>Verified by {info.method === 'bluetooth' ? 'Bluetooth proximity' : 'your location'}</strong>
          <p className="muted small-top">
            {info.method === 'bluetooth'
              ? `Your ${BANK_NAME} phone was confirmed nearby over Bluetooth`
              : `Your location was confirmed nearby`}{' '}
            at {time}, so no one-time code was needed.
          </p>
        </div>
      </div>
      <button className="primary" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  )
}
