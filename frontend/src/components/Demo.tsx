import { useState } from 'react'
import { api } from '../api'
import { BANK_NAME } from '../brand'
import InteractivePhone from './InteractivePhone'
import ProximityLogin, { type SignedInInfo } from './ProximityLogin'
import SignedIn from './SignedIn'

// Dev-only landing page: stands in for the login system flagging a suspicious attempt.
export default function Demo() {
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [emailMsg, setEmailMsg] = useState('')
  const [signedIn, setSignedIn] = useState<SignedInInfo | null>(null)

  async function sendEmail() {
    setEmailStatus('sending')
    try {
      const res = await api.triggerLogin('email')
      setEmailMsg(res.sent ? 'Email sent.' : 'Resend isn’t configured, so the email was logged in the backend console.')
      setEmailStatus('done')
    } catch (err) {
      setEmailMsg((err as Error).message)
      setEmailStatus('error')
    }
  }

  if (signedIn) return <SignedIn info={signedIn} onSignOut={() => setSignedIn(null)} />

  return (
    <div className="demo">
      <section className="card">
        <h1>{BANK_NAME}</h1>
        <ProximityLogin onSignedIn={setSignedIn} onFallback={() => api.triggerLogin('sms').then(() => {})} />
        <h2 className="section-title divider">No app or Bluetooth? Try it here →</h2>
        <p className="muted">
          The phone on the right is an interactive stand-in for the DoubleCheck app, so anyone can walk the whole
          flagged-login flow — the call check, the Big Fish chat, and verification — without installing anything.
        </p>
        <button className="link-button" onClick={sendEmail} disabled={emailStatus === 'sending'}>
          {emailStatus === 'sending' ? 'Sending…' : 'Or email me the survey link instead'}
        </button>
        {emailMsg && <p className={emailStatus === 'error' ? 'error' : 'muted small-top'}>{emailMsg}</p>}
      </section>
      <InteractivePhone />
    </div>
  )
}
