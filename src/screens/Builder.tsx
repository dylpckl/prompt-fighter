import { useState } from 'react'
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
  const complete = SLOTS.every(({ key }) => prompts[key].trim().length > 0)

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

      <button type="submit" disabled={!complete || busy} style={button()}>
        {busy ? 'Forging…' : 'Create fighter'}
      </button>
    </form>
  )
}
