import { useState } from 'react'
import type { PreviewNote, PreviewSnapshot } from '../../lib/api'
import { markerFor } from '../../lib/review'
import PixelDiff from './PixelDiff'
import Snapshot from './Snapshot'

export type CompareSide = { shot: PreviewSnapshot; label: string }

/** Two screenshots side by side, or stacked with a handle to swipe between them. */
export default function CompareView({ clientId, before, after, note, color }: {
  clientId: string
  before?: CompareSide
  after?: CompareSide
  note?: PreviewNote
  color?: string
}) {
  const [mode, setMode] = useState<'side' | 'swipe' | 'diff'>('side')
  const [split, setSplit] = useState(50)
  const both = before && after
  const marker = (shot: PreviewSnapshot) => note ? markerFor(shot, note) : null

  return (
    <div className="ps-rv-compare">
      {both && (
        <div className="ps-segmented ps-rv-compare-mode" role="radiogroup" aria-label="Compare layout">
          {(['side', 'swipe', 'diff'] as const).map(value => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} className={`ps-segmented-item ${mode === value ? 'active' : ''}`} onClick={() => setMode(value)}>
              {value === 'side' ? 'Side by side' : value === 'swipe' ? 'Swipe' : 'Highlight changes'}
            </button>
          ))}
        </div>
      )}
      {both && mode === 'diff' ? (
        <PixelDiff clientId={clientId} before={before.shot} after={after.shot} />
      ) : both && mode === 'swipe' ? (
        <div className="ps-rv-swipe">
          <div className="ps-rv-swipe-stage">
            <Snapshot clientId={clientId} shot={before.shot} marker={marker(before.shot)} color={color} alt={before.label} />
            <div className="ps-rv-swipe-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <Snapshot clientId={clientId} shot={after.shot} marker={marker(after.shot)} color={color} alt={after.label} />
            </div>
            <span className="ps-rv-swipe-line" style={{ left: `${split}%` }} aria-hidden="true" />
          </div>
          <div className="ps-rv-swipe-labels">
            <span>{before.label}</span>
            <input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Swipe between before and after" />
            <span>{after.label}</span>
          </div>
        </div>
      ) : (
        <div className={`ps-rv-side ${both ? '' : 'single'}`}>
          {[before, after].filter((side): side is CompareSide => Boolean(side)).map(side => (
            <figure key={side.shot.id}>
              <figcaption>{side.label}</figcaption>
              <Snapshot clientId={clientId} shot={side.shot} marker={marker(side.shot)} color={color} alt={side.label} />
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
