import { useEffect, useRef, useState } from 'react'
import { button, panel, t } from '@/theme'

/**
 * Share a path on this site. The native sheet where there is one (phones),
 * otherwise the link goes on the clipboard. If neither works, the link is shown
 * selected so it can be copied by hand.
 */
export function ShareButton({ path, text, labelText }: { path: string; text: string; labelText: string }) {
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function share() {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ url, text })
      } catch (err) {
        // Dismissing the sheet is a choice, not a failure. Anything else: the
        // await may have used up the click's permission, so the clipboard would
        // likely be refused too — show the link instead of trying it.
        if (!(err instanceof DOMException && err.name === 'AbortError')) setManual(url)
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setManual(url)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <button type="button" onClick={share} style={button('ghost')}>
        {copied ? 'Link copied' : labelText}
      </button>
      {manual && (
        <input
          readOnly
          value={manual}
          aria-label="Link to share"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...panel, background: t.panelHi, color: t.text, padding: '10px 12px', fontSize: 13, width: '100%', minWidth: 0 }}
        />
      )}
    </div>
  )
}
