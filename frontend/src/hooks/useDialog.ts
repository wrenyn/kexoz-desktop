import { useEffect, useRef, useState } from 'react'

export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const [trigger] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0)
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) (items()[0] ?? ref.current)?.focus()
    })
    const onFocus = (event: FocusEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) (items()[0] ?? ref.current).focus()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const all = items()
      const first = all[0]
      const last = all[all.length - 1]
      if (!first) { event.preventDefault(); ref.current?.focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [trigger])
  return ref
}
