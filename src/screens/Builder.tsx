import { useEffect, useState } from 'react'
import { PROMPT_MAX_CHARS } from '@/lib/engine/types'
import type { FighterPrompts } from '@/lib/engine/types'
import { button, label, panel, t } from '@/theme'

const SLOTS = [
  { key: 'body', title: 'Body', hint: 'What is it made of? What shape does it take?' },
  { key: 'weapon', title: 'Weapon', hint: 'What does it fight with?' },
  { key: 'move', title: 'Signature move', hint: 'The one it saves for when the meter fills.' },
  { key: 'flaw', title: 'Flaw', hint: 'Everyone has one. Yours is mandatory.' },
] as const

const EMPTY: FighterPrompts = { body: '', weapon: '', move: '', flaw: '' }

interface Props {
  onSubmit: (prompts: FighterPrompts) => void
  busy: boolean
  error: string | null
}

export function Builder({ onSubmit, busy, error }: Props) {
  const [prompts, setPrompts] = useState<FighterPrompts>(EMPTY)
  const [elapsed, setElapsed] = useState(0)
  const complete = SLOTS.every(({ key }) => prompts[key].trim().length > 0)

  // A counter is the one honest progress signal available — it proves the
  // request is still alive without inventing a percentage.
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (complete && !busy) onSubmit(prompts)
      }}
      style={{ display: 'grid', gap: 18 }}
    >
      <header style={{ display: 'grid', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '0.02em' }}>Build your fighter</h1>
        <p style={{ margin: 0, fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
          Four slots, {PROMPT_MAX_CHARS} characters each. That's all you get.
        </p>
      </header>

      {SLOTS.map(({ key, title, hint }) => {
        const value = prompts[key]
        const remaining = PROMPT_MAX_CHARS - value.length
        return (
          <div key={key} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ ...label, color: key === 'flaw' ? t.accent : t.dim }}>{title}</span>
              <span style={{ fontSize: 11, color: remaining <= 10 ? t.warn : t.faint }}>
                {remaining}
              </span>
            </div>
            <textarea
              value={value}
              maxLength={PROMPT_MAX_CHARS}
              rows={2}
              placeholder={hint}
              disabled={busy}
              onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
              style={{
                ...panel,
                background: t.panelHi,
                color: t.text,
                padding: '10px 12px',
                fontSize: 14,
                lineHeight: 1.45,
                resize: 'none',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
        )
      })}

      {error && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: t.accent,
            animation: 'fadeUp 200ms ease-out',
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <button
          type="submit"
          disabled={!complete || busy}
          className={busy ? 'forging' : undefined}
          style={button()}
        >
          {busy ? 'Forging' : 'Create fighter'}
        </button>

        {busy && <Forging seconds={elapsed} />}
      </div>
    </form>
  )
}

function Forging({ seconds }: { seconds: number }) {
  return (
    <div style={{ display: 'grid', gap: 8, animation: 'fadeUp 200ms ease-out' }}>
      <div
        style={{
          position: 'relative',
          height: 3,
          background: t.panelHi,
          border: `1px solid ${t.line}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '24%',
            background: t.accent,
            animation: 'sweep 1.3s ease-in-out infinite',
          }}
        />
      </div>

      <p style={{ ...label, margin: 0, textAlign: 'center', color: t.dim }}>
        Forging{seconds > 0 ? ` · ${seconds}s` : ''}
      </p>

      {seconds >= 20 && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: t.faint,
            textAlign: 'center',
            lineHeight: 1.5,
            animation: 'fadeUp 200ms ease-out',
          }}
        >
          Taking longer than usual. It gives up at 60 seconds.
        </p>
      )}
    </div>
  )
}
