import { useCallback, useRef, useState } from 'react'
import ConfirmDialog, { type ConfirmOptions } from '../components/modals/ConfirmDialog'

/** In-app replacement for window.confirm: `await confirm({...})` resolves true when accepted. */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((accepted: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setOptions(next)
  }), [])

  const settle = (accepted: boolean) => {
    resolver.current?.(accepted)
    resolver.current = null
    setOptions(null)
  }

  const dialog = options
    ? <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null

  return { confirm, dialog }
}
