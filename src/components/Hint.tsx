'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { t } from '@/theme'

const TOOLTIP_WIDTH = 220
/** Keep it off the viewport edge rather than flush against it. */
const EDGE_GUTTER = 12

/**
 * Hover, focus, or tap to explain a property.
 *
 * Tap matters: this app is mobile-first and there is no hover on a phone, so a
 * plain `title` attribute would have hidden every explanation from the people
 * most likely to need it.
 */
export function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  const tooltipId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const wasTouch = useRef(false)
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)

  // One tap elsewhere closes it. Without this a touch-opened tooltip has no
  // dismissal at all — there's no pointerleave on a finger — so they stack up.
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  /**
   * Decide placement from the trigger's own rect *before* showing, so the
   * tooltip never renders offscreen and then jumps. Right-aligned triggers —
   * move effects, the flaw, the b-side meter — sit close enough to the edge
   * that a left-anchored tooltip runs off the viewport.
   */
  function show() {
    const el = wrapRef.current
    if (el) {
      const { left } = el.getBoundingClientRect()
      const roomToTheRight = document.documentElement.clientWidth - left
      setAlignRight(roomToTheRight < TOOLTIP_WIDTH + EDGE_GUTTER)
    }
    setOpen(true)
  }

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      // Hover and tap are handled separately on purpose. A toggle-on-click
      // alongside open-on-hover cancels itself: browsers fire a synthetic
      // mouseenter before click, so the tooltip opened and immediately shut —
      // including on touch, where it would never have appeared at all.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') show()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') setOpen(false)
      }}
      // Record the pointer type here, but act on click. pointerdown fires the
      // moment a finger lands — including the finger that's about to scroll —
      // so opening here meant scrolling past a hint popped it open. A click
      // only lands if the touch stayed put.
      onPointerDown={(e) => {
        wasTouch.current = e.pointerType === 'touch'
      }}
      onClick={(e) => {
        if (!wasTouch.current) return
        e.stopPropagation()
        if (open) setOpen(false)
        else show()
      }}
      onFocus={show}
      onBlur={() => setOpen(false)}
      // Focusable so the explanation is reachable without a pointer. Deliberately
      // *not* role="button": it performs no action, and an aria-label here would
      // replace the visible text as the accessible name — a screen reader would
      // announce the explanation and never say "Vitality".
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
    >
      <span style={{ borderBottom: `1px dotted ${t.faint}` }}>{children}</span>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: alignRight ? 'auto' : 0,
            right: alignRight ? 0 : 'auto',
            zIndex: 30,
            width: TOOLTIP_WIDTH,
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
