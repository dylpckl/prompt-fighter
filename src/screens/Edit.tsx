import { useEffect, useState } from 'react'
import { PROMPT_MAX_CHARS, PROMPT_SLOT_LABELS as SLOTS } from '@/lib/engine/types'
import type { Fighter, FighterPrompts } from '@/lib/engine/types'
import { Sprite } from '@/components/Sprite'
import { Forging } from '@/screens/Builder'
import { button, label, panel, t } from '@/theme'

type Slot = keyof FighterPrompts

interface Props {
  fighter: Fighter
  onSubmit: (slot: Slot, text: string) => void
  onCancel: () => void
  busy: boolean
  error: string | null
}

/**
 * Spending the edit a lost life banked. One slot changes; the other three stay
 * as written, and the fighter comes back as its next version.
 */
export function Edit({ fighter, onSubmit, onCancel, busy, error }: Props) {
  const prompts = fighter.prompts
  const [slot, setSlot] = useState<Slot | null>(null)
  const [text, setText] = useState('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [busy])

  const trimmed = text.trim()
  const changed = slot !== null && trimmed.length > 0 && trimmed !== prompts?.[slot]

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (slot && changed && !busy) onSubmit(slot, trimmed)
      }}
      style={{ display: 'grid', gap: 18, animation: 'fadeUp 260ms ease-out' }}
    >
      <header style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Sprite sprite={fighter.sprite} scale={4} idle={false} />
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, overflowWrap: 'anywhere' }}>Rebuild {fighter.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
            Change one slot. It comes back as v{fighter.version + 1}.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 10 }} role="radiogroup" aria-label="Slot to change">
        {SLOTS.map(({ key, title, hint }) => {
          const selected = slot === key
          const current = prompts?.[key] ?? ''
          return (
            <div
              key={key}
              style={{
                ...panel,
                borderColor: selected ? t.accent : t.line,
                padding: 12,
                display: 'grid',
                gap: 8,
                minWidth: 0,
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => {
                  setSlot(key)
                  setText(current)
                }}
                style={{
                  all: 'unset',
                  cursor: busy ? 'default' : 'pointer',
                  display: 'grid',
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <span style={{ ...label, color: selected ? t.accent : t.dim }}>{title}</span>
                {!selected && (
                  <span style={{ fontSize: 14, color: current ? t.text : t.faint, overflowWrap: 'anywhere' }}>
                    {current || hint}
                  </span>
                )}
              </button>

              {selected && (
                <>
                  <textarea
                    autoFocus
                    value={text}
                    maxLength={PROMPT_MAX_CHARS}
                    rows={2}
                    placeholder={hint}
                    disabled={busy}
                    onChange={(e) => setText(e.target.value)}
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
                  <span
                    style={{
                      fontSize: 13,
                      textAlign: 'right',
                      color: PROMPT_MAX_CHARS - text.length <= 10 ? t.warn : t.faint,
                    }}
                  >
                    {PROMPT_MAX_CHARS - text.length}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      <div style={{ display: 'grid', gap: 10 }}>
        <button
          type="submit"
          disabled={!changed || busy}
          className={busy ? 'forging' : undefined}
          style={button()}
        >
          {busy ? 'Rebuilding' : 'Rebuild'}
        </button>
        {busy ? (
          <Forging seconds={elapsed} />
        ) : (
          <button type="button" onClick={onCancel} style={button('ghost')}>
            Not now — keep the edit
          </button>
        )}
      </div>
    </form>
  )
}
