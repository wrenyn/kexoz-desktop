import { useEffect, useMemo, useRef } from 'react'

// Only the most recently opened dialog owns focus and Escape.
const stack: symbol[] = []

export function useDialog(onClose: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement>(null)
  // Capture before React commits autofocus inside the newly opened dialog.
  const trigger = useMemo(() => enabled && document.activeElement instanceof HTMLElement ? document.activeElement : null, [enabled])
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!enabled || !ref.current) return
    const dialog = ref.current
    const id = Symbol('dialog')
    stack.push(id)
    const isTop = () => stack[stack.length - 1] === id
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
      .filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0 && !el.closest('[disabled], [inert], [hidden]'))
    const frame = requestAnimationFrame(() => {
      if (isTop() && !dialog.contains(document.activeElement)) (items()[0] ?? dialog).focus()
    })
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !dialog.contains(event.target as Node)) (items()[0] ?? dialog).focus()
    }
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const all = items()
      const first = all[0]
      const last = all[all.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const preventBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      if (isTop() && !dialog.contains(event.target as Node)) event.preventDefault()
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    document.addEventListener('wheel', preventBackgroundScroll, { passive: false })
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false })
    return () => {
      cancelAnimationFrame(frame)
      const wasTop = isTop()
      const index = stack.indexOf(id)
      if (index !== -1) stack.splice(index, 1)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('wheel', preventBackgroundScroll)
      document.removeEventListener('touchmove', preventBackgroundScroll)
      if (wasTop && trigger?.isConnected) trigger.focus()
    }
  }, [enabled, trigger])
  return ref
}
