import { useEffect, useRef, useState } from 'react'
import { api, type BlockReason, type ChatTurn } from '../api'
import { BANK_NAME, SUPPORT_NAME, SUPPORT_PHONE } from '../brand'

// On-screen stand-in for the native DoubleCheck app, sharing one session token
// with the web card (left): flagged login → check for an active call → Big Fish
// chat → confirm → a simulated verification that approves the session as "demo"
// (it can't do real proximity on one device; the real check is the web's "Pair
// with my phone"). Big Fish can also block the login (extortion / "this wasn't me").
type Step = 'idle' | 'home' | 'callcheck' | 'chat' | 'confirm' | 'verifying' | 'verified' | 'blocked' | 'error'

interface Session {
  token: string
  location: string
}

// Keyed by session token in the parent, so a new login remounts this fresh.
export default function InteractivePhone({ session }: { session: Session | null }) {
  const [step, setStep] = useState<Step>(session ? 'home' : 'idle')
  const [note, setNote] = useState('')
  const [blockReason, setBlockReason] = useState<BlockReason>('extortion')
  const [error, setError] = useState('')

  const token = session?.token ?? ''
  const location = session?.location ?? 'an unfamiliar location'

  // Runs once from the confirm click (not an effect), so the single-use code
  // endpoint is never hit twice by StrictMode.
  async function verify() {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    setStep('verifying')
    try {
      // This is the on-screen simulator, not a real proximity check — approve
      // the session as 'demo' so it never masquerades as real Bluetooth/GPS.
      setNote('Simulating the app verifying you…')
      await wait(1100)
      await api.verifySession(token, 'demo')
      setStep('verified')
    } catch (err) {
      setError((err as Error).message)
      setStep('error')
    }
  }

  return (
    <div className="phone" aria-label="Interactive app demo">
      <div className="phone-screen app-screen">
        <div className="phone-status">
          <span>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="phone-notch" aria-hidden="true" />
          <span aria-hidden="true">▂▄▆ ▮</span>
        </div>
        <div className="app-body">
          {step === 'idle' && (
            <div className="app-card">
              <div className="app-icon" aria-hidden="true">🔒</div>
              <h3>{BANK_NAME}</h3>
              <p className="app-muted">Enter your password on the left to start a sign-in. This app then verifies it.</p>
            </div>
          )}
          {step === 'error' && (
            <div className="center">
              <p className="app-error">{error}</p>
            </div>
          )}
          {step === 'home' && <Home location={location} onOpen={() => setStep('callcheck')} />}
          {step === 'callcheck' && <CallCheck onContinue={() => setStep('chat')} />}
          {step === 'chat' && (
            <Chat
              token={token}
              location={location}
              onProceed={() => setStep('confirm')}
              onBlocked={(reason) => {
                setBlockReason(reason)
                setStep('blocked')
              }}
            />
          )}
          {step === 'confirm' && <Confirm onBack={() => setStep('chat')} onConfirm={verify} />}
          {step === 'verifying' && <Verifying note={note} />}
          {step === 'verified' && <Verified />}
          {step === 'blocked' && <Blocked reason={blockReason} />}
        </div>
      </div>
      <p className="app-caption">Interactive demo — this is the app half of the sign-in on the left.</p>
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
        <span className="app-notif-body">We flagged a login from {location}. Tap to verify it's really you.</span>
      </button>
    </div>
  )
}

// The real app detects an active call (CallKit) and asks the backend whether
// it's genuinely from Sound. A Sound call passes silently; a non-Sound call
// warns and asks the member to hang up. Here the call state is simulated.
function CallCheck({ onContinue }: { onContinue: () => void }) {
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState(false)

  async function simulate(caller: 'none' | 'sound' | 'unknown') {
    setBusy(true)
    try {
      const r = await api.callCheck(caller)
      // Not on a call, or verified as a Sound call → no warning, carry on.
      if (!r.onCall || r.isSound) onContinue()
      else setWarn(true)
    } catch {
      onContinue()
    } finally {
      setBusy(false)
    }
  }

  const callLine = (
    <p className="app-muted tiny">
      Unsure if it's us? Call the real {BANK_NAME} at <a href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a>.
    </p>
  )

  if (warn) {
    return (
      <div className="app-card">
        <div className="app-icon" aria-hidden="true">⚠️</div>
        <h3>You're on a call with someone outside {BANK_NAME}</h3>
        <p className="app-muted">
          Please hang up before completing verification. {BANK_NAME} will never need to stay on the line while you sign
          in.
        </p>
        <button className="app-btn" onClick={onContinue}>
          I've hung up — continue
        </button>
        {callLine}
      </div>
    )
  }

  return (
    <div className="app-card">
      <div className="app-icon" aria-hidden="true">📞</div>
      <h3>Checking for an active call…</h3>
      <p className="app-muted">
        The app detects an active call and checks whether it's really from {BANK_NAME}. Simulate the call state:
      </p>
      <button className="app-btn" disabled={busy} onClick={() => simulate('none')}>
        Not on a call
      </button>
      <button className="app-btn ghost" disabled={busy} onClick={() => simulate('sound')}>
        On a call with {BANK_NAME}
      </button>
      <button className="app-btn ghost" disabled={busy} onClick={() => simulate('unknown')}>
        On a call with an unknown number
      </button>
      {callLine}
    </div>
  )
}

// Starter replies for the first turn; after that, suggestions come from Big Fish.
const OPENING_SUGGESTIONS = ["It's me, I'm logging in", 'Someone asked me to do this', "I'm not sure"]

function Chat({
  token,
  location,
  onProceed,
  onBlocked,
}: {
  token: string
  location: string
  onProceed: () => void
  onBlocked: (reason: BlockReason) => void
}) {
  const greeting = `Hi, I'm Big Fish from the ${BANK_NAME} safety team — thanks for taking a moment with me. A login from ${location} was flagged, so I'm just checking in before it goes through. Is this you logging in right now?`
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: 'assistant', content: greeting }])
  const [suggestions, setSuggestions] = useState<string[]>(OPENING_SUGGESTIONS)
  const [cleared, setCleared] = useState(false) // Big Fish said it's fine to proceed
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
    setSuggestions([])
    setInput('')
    setBusy(true)
    try {
      const res = await api.bigFish(token, next)
      setTurns((t) => [...t, { role: 'assistant', content: res.reply }])
      if (res.action === 'extortion' || res.action === 'not_me') {
        // Let the message land, then end the chat on the blocked screen.
        setTimeout(() => onBlocked(res.action as BlockReason), 2200)
      } else {
        setSuggestions(res.suggestions)
        if (res.action === 'proceed') setCleared(true)
      }
    } catch {
      setTurns((t) => [...t, { role: 'assistant', content: 'Sorry, I had trouble responding. Please try again.' }])
      setSuggestions(OPENING_SUGGESTIONS)
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
      {cleared && (
        <button className="app-btn" onClick={onProceed}>
          Continue to sign in
        </button>
      )}
      {suggestions.length > 0 && (
        <div className="app-chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" disabled={busy} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
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
      {!cleared && (
        <button className="app-link" onClick={onProceed}>
          I'd like to log in and access my account
        </button>
      )}
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

function Verifying({ note }: { note: string }) {
  return (
    <div className="app-card">
      <div className="app-spinner" aria-hidden="true" />
      <h3>Verifying it's you</h3>
      <p className="app-muted">{note}</p>
    </div>
  )
}

function Verified() {
  return (
    <div className="app-card">
      <div className="app-icon ok" aria-hidden="true">✓</div>
      <h3>Verified (demo)</h3>
      <p className="app-muted">You're now signed in on your computer.</p>
      <p className="app-muted tiny">
        This is the on-screen walkthrough — it doesn't perform a real proximity check. With the real app, the actual
        Bluetooth verification is the "Pair with my phone" button on the sign-in to the left.
      </p>
    </div>
  )
}

// On the phone we don't show a "locked" wall — the web handles the lock. Here we
// gently guide the person through securing their account.
function Blocked({ reason }: { reason: BlockReason }) {
  return (
    <div className="app-card secure">
      <div className="app-icon" aria-hidden="true">🛟</div>
      <h3>Let's keep your account safe</h3>
      <p className="app-muted">
        {reason === 'extortion'
          ? "We've paused the sign-in on your computer. Here are a few steps to protect your account:"
          : "Thanks for letting us know this wasn't you. We've paused the sign-in on your computer. Here's how to secure your account:"}
      </p>
      <ol className="app-steplist">
        <li>Change your password now, and anywhere you've reused it.</li>
        <li>Review recent activity and sign out of devices you don't recognize.</li>
        <li>Never share a code or move money because someone told you to.</li>
        <li>
          Call <strong>{SUPPORT_NAME}</strong> at <strong>{SUPPORT_PHONE}</strong> — they'll help you finish securing
          things.
        </li>
        {reason === 'extortion' && <li>If someone is threatening you, contact local law enforcement.</li>}
      </ol>
    </div>
  )
}
