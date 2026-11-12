import type { ComponentProps } from 'react'
import { createPortal } from 'react-dom'

/** Keep every dialog above navigation, page animations, and scrolling panels. */
export default function ModalOverlay({ className = '', ...props }: ComponentProps<'div'>) {
  const overlay = <div className={`ps-modal-overlay ${className}`} {...props} />
  return typeof document !== 'undefined' && document.body ? createPortal(overlay, document.body) : overlay
}
