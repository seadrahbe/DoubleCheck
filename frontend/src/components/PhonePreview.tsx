import { useEffect, useRef } from 'react'

export interface TextMessage {
  body: string
  at: Date
}

// Stand-in for a real phone: shows the texts the backend would have sent,
// with the survey link tappable like in a real messages app.
export default function PhonePreview({ messages }: { messages: TextMessage[] }) {
  const threadRef = useRef<HTMLDivElement>(null)

  // Keep the newest text in view, like a real messages app.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="phone" aria-label="Text message preview">
      <div className="phone-screen">
        <div className="phone-status">
          <span>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="phone-notch" aria-hidden="true" />
          <span aria-hidden="true">▂▄▆ ▮</span>
        </div>
        <div className="phone-contact">
          <span className="phone-avatar" aria-hidden="true">✓✓</span>
          <span className="phone-name">DoubleCheck</span>
          <span className="phone-sub">Text Message</span>
        </div>
        <div className="phone-thread" ref={threadRef}>
          {messages.length === 0 && <p className="phone-empty">No messages yet. Press “Send text”.</p>}
          {messages.map((m, i) => (
            <div key={i} className="phone-msg">
              <time className="phone-time">
                {m.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </time>
              <p className="phone-bubble">{linkify(m.body)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part}>
        {part}
      </a>
    ) : (
      part
    ),
  )
}
