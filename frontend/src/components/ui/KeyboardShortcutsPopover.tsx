import { useEffect, useRef } from 'react'

type Props = {
  onClose: () => void
}

const SHORTCUTS = [
  { key: 'Ctrl+1', action: 'Dashboard' },
  { key: 'Ctrl+2', action: 'Shares' },
  { key: 'Ctrl+3', action: 'Requests' },
  { key: 'Ctrl+4', action: 'Domains' },
  { key: 'Ctrl+5', action: 'Settings' },
  { key: 'Ctrl+N', action: 'New share' },
  { key: 'Ctrl+K', action: 'Command palette' },
  { key: 'Esc', action: 'Close dialog / popover' },
]

export default function KeyboardShortcutsPopover({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  return (
    <div ref={ref} className="ps-shortcuts-popover animate-scale-in">
      <div className="ps-shortcuts-title">Keyboard shortcuts</div>
      <div className="ps-shortcuts-list">
        {SHORTCUTS.map(({ key, action }) => (
          <div key={key} className="ps-shortcut-row">
            <span className="ps-shortcut-action">{action}</span>
            <kbd className="ps-kbd">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
