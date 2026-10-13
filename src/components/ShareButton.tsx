import { useState } from 'react'
import { button } from '@/theme'

/**
 * Share a path on this site. The native sheet where there is one (phones),
 * otherwise the link goes on the clipboard.
 */
export function ShareButton({ path, text, labelText }: { path: string; text: string; labelText: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ url, text })
        return
      } catch (err) {
        // Dismissing the sheet is not a failure worth falling through for.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <button type="button" onClick={share} style={button('ghost')}>
      {copied ? 'Link copied' : labelText}
    </button>
  )
}
