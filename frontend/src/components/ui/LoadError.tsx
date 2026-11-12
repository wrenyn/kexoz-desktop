import { AlertCircle, RefreshCw } from 'lucide-react'

export default function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="ps-load-error" role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="ps-btn ps-btn-secondary ps-btn-sm" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" /> Try again</button>
    </div>
  )
}
