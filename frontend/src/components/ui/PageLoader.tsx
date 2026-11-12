import { PageSkeleton } from './LoadingBlock'
import Spinner from './Spinner'

/** Full-page loading shell used while a lazy route chunk loads. */
export default function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="ps-main ps-page-loader" aria-busy="true" aria-label={label}>
      <div className="ps-page-header">
        <div>
          <div className="ps-page-loader-title" />
          <div className="ps-page-loader-sub" />
        </div>
      </div>
      <div className="ps-page-content">
        <div className="ps-page-loader-status">
          <Spinner size={16} />
          <span role="status">{label}</span>
        </div>
        <PageSkeleton cards={3} />
      </div>
    </div>
  )
}
