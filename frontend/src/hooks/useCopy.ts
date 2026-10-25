import { useState } from 'react'

/** Copies text and remembers which key was copied for a moment, for "Copied" labels. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(current => current === key ? null : current), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return { copied, copy }
}
