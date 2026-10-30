import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'default'
}

type Props = ConfirmOptions & {
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel, tone = 'default', onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const buttons = dialogRef.current.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="ps-modal-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="ps-modal ps-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={event => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="ps-confirm-body">
          <h2 className="ps-confirm-title" id="confirm-title">{title}</h2>
          <div className="ps-confirm-message" id="confirm-message">{message}</div>
        </div>
        <div className="ps-confirm-footer">
          <button type="button" className="ps-btn ps-btn-secondary" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className={`ps-btn ${tone === 'danger' ? 'ps-btn-danger' : 'ps-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
