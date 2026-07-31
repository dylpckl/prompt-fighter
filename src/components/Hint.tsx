'use client'

import { useState } from 'react'
import { t } from '@/theme'

/**
 * Hover, focus, or tap to explain a property.
 *
 * Tap matters: this app is mobile-first and there is no hover on a phone, so a
 * plain `title` attribute would have hidden every explanation from the people
 * most likely to need it.
 */
export function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      // Hover and tap are handled separately on purpose. A toggle-on-click
      // alongside open-on-hover cancels itself: browsers fire a synthetic
      // mouseenter before click, so the tooltip opened and immediately shut —
      // including on touch, where it would never have appeared at all.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setOpen(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') setOpen(false)
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') {
          e.stopPropagation()
          setOpen((o) => !o)
        }
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-label={text}
    >
      <span style={{ borderBottom: `1px dotted ${t.faint}` }}>{children}</span>

      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            width: 220,
            maxWidth: '70vw',
            padding: '8px 10px',
            background: t.panelHi,
            border: `1px solid ${t.line}`,
            borderRadius: 3,
            // The trigger is often an uppercase label — reset its type styling.
            font: `12px/1.5 ${t.mono}`,
            letterSpacing: 'normal',
            textTransform: 'none',
            color: t.text,
            textAlign: 'left',
            pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
