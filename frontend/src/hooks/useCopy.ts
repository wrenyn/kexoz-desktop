import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

/** Copies text and remembers which key was copied for a moment, for "Copied" labels. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Couldn’t copy. Select the text and copy it manually.')
    }
  }
  return { copied, copy }
}
