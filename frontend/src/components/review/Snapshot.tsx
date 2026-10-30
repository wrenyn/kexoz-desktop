import { useEffect, useState } from 'react'
import { snapshotObjectUrl, type PreviewSnapshot } from '../../lib/api'

/**
 * A stored screenshot with an optional pin drawn where the note sits.
 * With `frame` (width / height), tall shots are cropped to that shape around the pin.
 */
export default function Snapshot({ clientId, shot, marker, color, alt, className, frame }: {
  clientId: string
  shot: PreviewSnapshot
  marker?: { x: number; y: number } | null
  color?: string
  alt: string
  className?: string
  frame?: number
}) {
  const [image, setImage] = useState<{ id: string; src: string; failed: boolean } | null>(null)
  const current = image?.id === shot.id ? image : null
  const src = current?.src ?? ''
  const failed = current?.failed ?? false

  useEffect(() => {
    let alive = true
    snapshotObjectUrl(clientId, shot.id)
      .then(url => { if (alive) setImage({ id: shot.id, src: url, failed: false }) })
      .catch(() => { if (alive) setImage({ id: shot.id, src: '', failed: true }) })
    return () => { alive = false }
  }, [clientId, shot.id])

  const ratio = shot.width && shot.height ? shot.width / shot.height : 0
  const visible = frame && ratio ? Math.min(1, ratio / frame) : 1
  const offset = visible < 1 ? Math.min(Math.max((marker?.y ?? 0) - visible / 2, 0), 1 - visible) : 0
  const markerTop = marker ? (marker.y - offset) / visible : 0

  return (
    <div className={`ps-rv-shot ${className ?? ''}`} style={{ aspectRatio: visible < 1 ? String(frame) : ratio ? `${shot.width} / ${shot.height}` : undefined }}>
      {src
        ? <img src={src} alt={alt} draggable={false} style={offset ? { transform: `translateY(-${offset * 100}%)` } : undefined} />
        : <span className="ps-rv-shot-wait">{failed ? 'Screenshot unavailable' : 'Loading…'}</span>}
      {src && marker && (
        <span className="ps-rv-marker" style={{ left: `${marker.x * 100}%`, top: `${markerTop * 100}%`, background: color }} aria-hidden="true" />
      )}
    </div>
  )
}
