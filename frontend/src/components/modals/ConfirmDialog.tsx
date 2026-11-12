import ModalOverlay from '../ui/ModalOverlay'
import { type ReactNode } from 'react'
import { useDialog } from '../../hooks/useDialog'

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
  const dialogRef = useDialog(onCancel)

  return (
    <ModalOverlay onClick={onCancel}>
      <div
        ref={dialogRef}
        className="ps-modal ps-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={event => event.stopPropagation()}
        tabIndex={-1}
      >
        <div className={`ps-confirm-body ${tone === 'danger' ? 'is-danger' : ''}`}>
          <div className="ps-confirm-copy">
            <h2 className="ps-confirm-title" id="confirm-title">{title}</h2>
            <div className="ps-confirm-message" id="confirm-message">{message}</div>
          </div>
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
    </ModalOverlay>
  )
}
