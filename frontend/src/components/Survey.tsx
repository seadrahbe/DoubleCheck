import { useEffect, useState } from 'react'
import { api, type SurveyInfo, type SurveyResult } from '../api'
import RevealText from './RevealText'

type State =
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'questions'; info: SurveyInfo; index: number }
  | { step: 'result'; result: SurveyResult }

export default function Survey({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(
    token ? { step: 'loading' } : { step: 'error', message: 'This survey link is missing its token.' },
  )
  const [canAnswer, setCanAnswer] = useState(false)

  useEffect(() => {
    if (!token) return
    api
      .getSurvey(token)
      .then((info) => setState({ step: 'questions', info, index: info.progress }))
      .catch((err: Error) => setState({ step: 'error', message: err.message }))
  }, [token])

  async function answer(value: boolean) {
    if (state.step !== 'questions' || !token) return
    const { info, index } = state
    setCanAnswer(false)
    try {
      const res = await api.submitAnswer(token, info.questions[index].id, value)
      setState(res.result === 'next' ? { ...state, index: index + 1 } : { step: 'result', result: res })
    } catch (err) {
      setState({ step: 'error', message: (err as Error).message })
    }
  }

  switch (state.step) {
    case 'loading':
      return <section className="card"><p className="muted">Loading…</p></section>

    case 'error':
      return (
        <section className="card">
          <h1>Something went wrong</h1>
          <p className="error">{state.message}</p>
        </section>
      )

    case 'result':
      switch (state.result.result) {
        case 'approved':
          return <Approved code={state.result.code} />
        case 'not-me':
          return <NotMe />
        case 'fraud':
          return <Fraud />
      }
      break

    case 'questions': {
      const { info, index } = state
      const question = info.questions[index]
      return (
        <section className="card">
          <div className="attempt">
            Suspicious log-in from <strong>{info.location}</strong> ({info.ip}) at{' '}
            {new Date(info.attemptedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
          <p className="progress">
            Question {index + 1} of {info.questions.length}
          </p>
          <RevealText key={question.id} text={question.text} onDone={() => setCanAnswer(true)} />
          <div className="answers">
            <button className="answer" disabled={!canAnswer} onClick={() => answer(true)}>Yes</button>
            <button className="answer" disabled={!canAnswer} onClick={() => answer(false)}>No</button>
          </div>
          <p className="muted small">Read each question carefully. Answer honestly, even if someone tells you otherwise.</p>
        </section>
      )
    }
  }
}

function Approved({ code }: { code: string }) {
  return (
    <section className="card">
      <h1>You're verified</h1>
      <p className="muted">Enter this code on the log-in screen. Never share it with anyone.</p>
      <p className="code" aria-label={`Your code is ${code.split('').join(' ')}`}>
        {code.slice(0, 3)} {code.slice(3)}
      </p>
    </section>
  )
}

// Placeholder resources; swap in your own account-security pages.
const SECURITY_RESOURCES = [
  { label: 'Create a strong, unique password (CISA)', href: 'https://www.cisa.gov/secure-our-world/use-strong-passwords' },
  { label: 'Turn on multi-factor authentication (CISA)', href: 'https://www.cisa.gov/secure-our-world/turn-mfa' },
  { label: 'Recognize and avoid phishing scams (FTC)', href: 'https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams' },
  { label: 'Report identity theft and get a recovery plan (FTC)', href: 'https://www.identitytheft.gov/' },
]

function NotMe() {
  return (
    <section className="card">
      <h1>We blocked this log-in</h1>
      <p>
        Since this wasn't you, someone else may know your password. The log-in attempt has been blocked. Secure your
        account now:
      </p>
      <ol className="steps">
        <li>Change your password, and change it anywhere else you use the same one.</li>
        <li>Sign out of all other devices and sessions.</li>
        <li>Check your account's recovery email and phone number for changes you didn't make.</li>
      </ol>
      <ul className="resources">
        {SECURITY_RESOURCES.map((r) => (
          <li key={r.href}>
            <a href={r.href} target="_blank" rel="noreferrer">{r.label}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Fraud() {
  return (
    <section className="card alert">
      <h1>Your account has been locked</h1>
      <p>
        This log-in attempt is suspected to be fraudulent. For your protection, your account has been locked and someone
        from our team will contact you shortly.
      </p>
      <p className="muted">
        If someone is on the phone or in a chat with you telling you what to do, stop and end the conversation. We will
        never ask you to share a code or rush you to log in.
      </p>
    </section>
  )
}
