import { PROMPT_SLOT_LABELS } from '@/lib/engine/types'
import type { FighterPrompts } from '@/lib/engine/types'
import { label, panel, t } from '@/theme'

/**
 * The four prompts a fighter was built from, read back. Used by the killcam —
 * what beat you — and by the obituary, where a dead fighter's go public.
 */
export function PromptSheet({
  heading,
  prompts,
  accent = t.line,
}: {
  heading: string
  prompts: FighterPrompts
  accent?: string
}) {
  return (
    <div style={{ ...panel, borderColor: accent, padding: 14, display: 'grid', gap: 12, minWidth: 0 }}>
      <p style={{ ...label, margin: 0, color: accent === t.line ? t.dim : accent }}>{heading}</p>
      <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
        {PROMPT_SLOT_LABELS.map(({ key, title }) => (
          <div key={key} style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <dt style={{ ...label, color: key === 'flaw' ? t.accent : t.faint }}>{title}</dt>
            <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              {prompts[key]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
