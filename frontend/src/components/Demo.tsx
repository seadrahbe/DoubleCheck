import { useState } from 'react'
import { api, type Channel } from '../api'

const NOT_CONFIGURED: Record<Channel, string> = {
  sms: 'Twilio is not configured, so the text was logged in the backend console.',
  email: 'SMTP is not configured, so the email was logged in the backend console.',
}

// Dev-only landing page: stands in for the login system flagging a suspicious attempt.
export default function Demo() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')

  async function trigger(channel: Channel) {
    setStatus('sending')
    try {
      const res = await api.triggerLogin(channel)
      setLink(res.link)
      setMessage(res.sent ? (channel === 'email' ? 'Email sent.' : 'Text sent to your phone.') : NOT_CONFIGURED[channel])
      setStatus('done')
    } catch (err) {
      setMessage((err as Error).message)
      setStatus('error')
    }
  }

  return (
    <section className="card">
      <h1>Prototype demo</h1>
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
  )
}
