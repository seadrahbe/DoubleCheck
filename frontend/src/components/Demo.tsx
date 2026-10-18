import { useState } from 'react'
import { api, ApiError, type Channel } from '../api'
import { BANK_NAME } from '../brand'
import PhonePreview, { type TextMessage } from './PhonePreview'
import ProximityLogin, { type SignedInInfo } from './ProximityLogin'
import SignedIn from './SignedIn'

const NOT_CONFIGURED: Record<Channel, string> = {
  sms: 'Twilio is not configured, so the text is shown on the phone instead.',
  email: 'Resend is not configured, so the email was logged in the backend console.',
}

// Dev-only landing page: stands in for the login system flagging a suspicious attempt.
export default function Demo() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const [texts, setTexts] = useState<TextMessage[]>([])
  const [signedIn, setSignedIn] = useState<SignedInInfo | null>(null)

  async function trigger(channel: Channel) {
    setStatus('sending')
    try {
      const res = await api.triggerLogin(channel)
      setLink(res.link)
      if (channel === 'sms') setTexts((t) => [...t, { body: res.message, at: new Date() }])
      setMessage(res.sent ? (channel === 'email' ? 'Email sent.' : 'Text sent to your phone.') : NOT_CONFIGURED[channel])
      setStatus('done')
    } catch (err) {
      // Sending failed (e.g. Twilio trial restrictions), but the survey link still
      // works, so show the text on the phone anyway.
      const data = err instanceof ApiError ? err.data : {}
      if (typeof data.link === 'string') setLink(data.link)
      if (channel === 'sms' && typeof data.message === 'string') {
        setTexts((t) => [...t, { body: data.message as string, at: new Date() }])
      }
      setMessage((err as Error).message)
      setStatus('error')
    }
  }

  if (signedIn) return <SignedIn info={signedIn} onSignOut={() => setSignedIn(null)} />

  return (
    <div className="demo">
      <section className="card">
        <h1>{BANK_NAME}</h1>
        <ProximityLogin onSignedIn={setSignedIn} onFallback={() => trigger('sms')} />
        <h2 className="section-title divider">Or send the survey directly</h2>
        <p className="muted">
          Simulate a suspicious login. The backend sends the DoubleCheck survey link to the phone number or email
          address in <code>backend/.env</code>.
        </p>
        <div className="answers">
          <button className="primary" onClick={() => trigger('sms')} disabled={status === 'sending'}>
            Send text
          </button>
          <button className="primary" onClick={() => trigger('email')} disabled={status === 'sending'}>
            Send email
          </button>
        </div>
        {status === 'sending' && <p className="muted">Sending…</p>}
        {message && <p className={status === 'error' ? 'error' : 'muted'}>{message}</p>}
        {link && (
          <p className="muted">
            Or open it here: <a href={link}>survey link</a>
          </p>
        )}
      </section>
      <PhonePreview messages={texts} />
    </div>
  )
}
