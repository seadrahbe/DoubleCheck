import { useEffect, useState } from 'react'

interface Props {
  text: string
  msPerWord?: number
  onDone?: () => void
}

// Reveals `text` one word at a time so it has to be read, then calls onDone.
// Hidden words are still laid out (just invisible) so the text doesn't reflow.
// Give it a `key` per question so it restarts when the text changes.
export default function RevealText({ text, msPerWord = 320, onDone }: Props) {
  const words = text.split(/\s+/)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (shown >= words.length) {
      // Short pause after the last word before answers unlock.
      const t = setTimeout(() => onDone?.(), 600)
      return () => clearTimeout(t)
    }
    // Linger a little longer at the end of a clause or sentence.
    const prev = words[shown - 1] ?? ''
    const delay = /[,.?!:;]$/.test(prev) ? msPerWord * 2 : msPerWord
    const t = setTimeout(() => setShown((n) => n + 1), delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  return (
    <p className="reveal">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={i} className={i < shown ? 'word visible' : 'word'}>
            {w}{' '}
          </span>
        ))}
      </span>
    </p>
  )
}
