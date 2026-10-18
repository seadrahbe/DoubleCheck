import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ChatTurn } from '../api'
import { BANK_NAME } from '../brand'

// An on-screen stand-in for the native DoubleCheck app, so people who can't
// install it can still walk the whole flow: flagged login → check for an active
// call → Big Fish support chat → confirm → verify (Bluetooth/GPS/code) → code.
type Step = 'loading' | 'home' | 'callcheck' | 'chat' | 'confirm' | 'verifying' | 'code' | 'error'

// Starter prompts the user can tap; the small "log in" option lives separately.
const CHIPS = ['I need support', 'How can I tell if a call is real?', 'Warning signs of romantic extortion']

export default function InteractivePhone() {
  const [step, setStep] = useState<Step>('loading')
  const [token, setToken] = useState('')
  const [location, setLocation] = useState('an unfamiliar location')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  // Stable so Verifying's effect depends on it without re-running on re-render.
  const toCode = useCallback(() => setStep('code'), [])

  async function start() {
    setStep('loading')
    try {
      const res = await api.flaggedLogin()
      setToken(res.token)
      setLocation(res.location)
      setStep('home')
    } catch (err) {
      setError((err as Error).message)
      setStep('error')
    }
  }

  // Issue the one-time code from the confirm click (an event handler runs once,
  // unlike an effect, which StrictMode double-invokes and would use up the token).
  async function confirmAndVerify() {
    setStep('verifying')
    try {
      const res = await api.issueCode(token)
      setCode(res.code)
    } catch (err) {
      setError((err as Error).message)
      setStep('error')
    }
  }

  // Fetch on mount without a synchronous setState (state starts at 'loading').
  useEffect(() => {
    let cancelled = false
    api
      .flaggedLogin()
      .then((res) => {
        if (cancelled) return
        setToken(res.token)
        setLocation(res.location)
        setStep('home')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setStep('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="phone" aria-label="Interactive app demo">
      <div className="phone-screen app-screen">
        <div className="phone-status">
          <span>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="phone-notch" aria-hidden="true" />
          <span aria-hidden="true">▂▄▆ ▮</span>
        </div>
        <div className="app-body">
          {step === 'loading' && <p className="app-muted center">Connecting…</p>}
          {step === 'error' && (
            <div className="center">
              <p className="app-error">{error}</p>
              <button className="app-btn" onClick={start}>
                Try again
              </button>
            </div>
          )}
          {step === 'home' && <Home location={location} onOpen={() => setStep('callcheck')} />}
          {step === 'callcheck' && <CallCheck onContinue={() => setStep('chat')} />}
          {step === 'chat' && (
            <Chat token={token} location={location} onLogIn={() => setStep('confirm')} />
          )}
          {step === 'confirm' && <Confirm onBack={() => setStep('chat')} onConfirm={confirmAndVerify} />}
          {step === 'verifying' && <Verifying onDone={toCode} />}
          {step === 'code' && <CodeScreen code={code} onDone={start} />}
        </div>
      </div>
      <p className="app-caption">Interactive demo — no app install or Bluetooth needed.</p>
    </div>
  )
}

function Home({ location, onOpen }: { location: string; onOpen: () => void }) {
  return (
    <div className="app-home">
      <p className="app-time-big">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <button className="app-notif" onClick={onOpen}>
        <span className="app-notif-head">
          <span className="app-badge" aria-hidden="true">✓✓</span>
          {BANK_NAME} · now
        </span>
        <span className="app-notif-body">
          We flagged a login from {location}. Tap to verify it's really you.
        </span>
      </button>
    </div>
  )
}

function CallCheck({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="app-card">
      <div className="app-icon" aria-hidden="true">📞</div>
      <h3>Are you on a phone or video call right now?</h3>
      <p className="app-muted">
        If someone is on a call guiding you through this login, please hang up before continuing. A real bank or agency
        will never need to stay on the line while you log in.
      </p>
      <button className="app-btn" onClick={onContinue}>
        No, I'm not on a call
      </button>
      <button className="app-btn ghost" onClick={onContinue}>
        I was — I've hung up now
      </button>
    </div>
  )
}

function Chat({ token, location, onLogIn }: { token: string; location: string; onLogIn: () => void }) {
  const greeting = `Hi, I'm Big Fish from the ${BANK_NAME} safety team. We flagged a login from ${location}. You're not in trouble — I just want to make sure you're safe. Is anyone helping you with this login right now?`
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: 'assistant', content: greeting }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const next = [...turns, { role: 'user' as const, content }]
    setTurns(next)
    setInput('')
    setBusy(true)
    try {
      const res = await api.bigFish(token, next)
      setTurns((t) => [...t, { role: 'assistant', content: res.reply }])
    } catch {
      setTurns((t) => [...t, { role: 'assistant', content: "Sorry, I had trouble responding. Please try again." }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-chat">
      <div className="app-chat-head">
        <span className="app-badge big" aria-hidden="true">🐟</span>
        <div>
          <strong>Big Fish</strong>
          <span className="app-muted tiny">{BANK_NAME} safety team</span>
        </div>
      </div>
      <div className="app-thread" ref={threadRef}>
        {turns.map((t, i) => (
          <p key={i} className={t.role === 'user' ? 'bubble me' : 'bubble them'}>
            {t.content}
          </p>
        ))}
        {busy && <p className="bubble them typing">…</p>}
      </div>
      <div className="app-chips">
        {CHIPS.map((c) => (
          <button key={c} className="chip" disabled={busy} onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>
      <form
        className="app-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message Big Fish"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
      <button className="app-link" onClick={onLogIn}>
        I'd like to log in and access my account
      </button>
    </div>
  )
}

function Confirm({ onBack, onConfirm }: { onBack: () => void; onConfirm: () => void }) {
  return (
    <div className="app-card">
      <div className="app-icon" aria-hidden="true">⚠️</div>
      <h3>Are you sure?</h3>
      <p className="app-muted">
        If anyone is guiding you, pressuring you, or asked you to log in or share a code, please stop now and talk to
        someone you trust first.
      </p>
      <button className="app-btn" onClick={onConfirm}>
        Yes, verify and log me in
      </button>
      <button className="app-btn ghost" onClick={onBack}>
        Go back
      </button>
    </div>
  )
}

// Shows the real fallback chain by capability: Bluetooth → GPS → send the code.
// The code itself was already issued by the confirm handler; this only animates.
function Verifying({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([])

  // onDone is stable (useCallback in the parent), so this runs once.
  useEffect(() => {
    let cancelled = false
    const add = (s: string) => !cancelled && setLines((l) => [...l, s])
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

    async function run() {
      add('Checking your DoubleCheck Key over Bluetooth…')
      await wait(1100)
      if ('bluetooth' in navigator) {
        add('Verified your key is nearby over Bluetooth ✓')
      } else if ('geolocation' in navigator) {
        add('Bluetooth unavailable. Checking your location…')
        await wait(900)
        await new Promise<void>((resolve) =>
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { timeout: 4000 },
          ),
        )
        add('Verified by your location ✓')
      } else {
        add('Bluetooth and location unavailable. Sending your code…')
      }
      await wait(900)
      if (!cancelled) onDone()
    }
    run()
    return () => {
      cancelled = true
    }
  }, [onDone])

  return (
    <div className="app-card">
      <div className="app-spinner" aria-hidden="true" />
      <h3>Verifying it's you</h3>
      <div className="app-steps">
        {lines.map((l, i) => (
          <p key={i} className={l.includes('✓') ? 'ok' : ''}>
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}

function CodeScreen({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="app-card">
      <div className="app-icon ok" aria-hidden="true">✓</div>
      <h3>You're verified</h3>
      <p className="app-muted">Here's your one-time code. Never share it with anyone.</p>
      <p className="app-code">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : '· · ·'}</p>
      <p className="app-muted tiny">This is how the code reaches you when your phone can't be auto-verified nearby.</p>
      <button className="app-btn ghost" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
