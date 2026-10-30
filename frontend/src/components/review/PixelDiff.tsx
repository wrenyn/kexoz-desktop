import { useEffect, useRef, useState } from 'react'
import { snapshotObjectUrl, type PreviewSnapshot } from '../../lib/api'

const MAX_WIDTH = 1200
const MAX_HEIGHT = 4000
/** Per-channel difference that counts as a change; JPEG noise stays below it. */
const THRESHOLD = 40

type Result =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'done'; changedPct: number; width: number; height: number }

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('Screenshot unavailable'))
  image.src = src
})

/** Where a screenshot sits on the page, in page pixels. */
const pageRect = (shot: PreviewSnapshot) => {
  const scale = shot.scale || 1
  return { left: shot.originX, top: shot.originY, right: shot.originX + shot.width / scale, bottom: shot.originY + shot.height / scale, scale }
}

function crop(image: HTMLImageElement, shot: PreviewSnapshot, area: { left: number; top: number; width: number; height: number }, outW: number, outH: number) {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not draw the screenshots')
  const { scale } = pageRect(shot)
  ctx.drawImage(image, (area.left - shot.originX) * scale, (area.top - shot.originY) * scale, area.width * scale, area.height * scale, 0, 0, outW, outH)
  return ctx.getImageData(0, 0, outW, outH)
}

/**
 * Highlights what changed between two screenshots of the same page. Both are
 * placed by their page position, so a cropped note shot lines up with a
 * full-page one; only the part both show is compared.
 */
export default function PixelDiff({ clientId, before, after }: { clientId: string; before: PreviewSnapshot; after: PreviewSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null)
  const key = `${before.id}:${after.id}`
  const current = result?.key === key ? result.value : { state: 'loading' as const }

  useEffect(() => {
    let alive = true
    const finish = (value: Result) => { if (alive) setResult({ key: `${before.id}:${after.id}`, value }) }
    Promise.all([snapshotObjectUrl(clientId, before.id), snapshotObjectUrl(clientId, after.id)])
      .then(urls => Promise.all(urls.map(loadImage)))
      .then(([imageA, imageB]) => {
        if (!alive) return
        const a = pageRect(before)
        const b = pageRect(after)
        const left = Math.max(a.left, b.left)
        const top = Math.max(a.top, b.top)
        const width = Math.min(a.right, b.right) - left
        const height = Math.min(a.bottom, b.bottom) - top
        if (width < 8 || height < 8) {
          finish({ state: 'failed', message: 'These screenshots show different parts of the page, so there is nothing to compare.' })
          return
        }
        let scale = Math.min(a.scale, b.scale)
        scale = Math.min(scale, MAX_WIDTH / width, MAX_HEIGHT / height)
        const outW = Math.max(1, Math.round(width * scale))
        const outH = Math.max(1, Math.round(height * scale))
        const area = { left, top, width, height }
        const pixelsA = crop(imageA, before, area, outW, outH).data
        const imageDataB = crop(imageB, after, area, outW, outH)
        const pixelsB = imageDataB.data
        const out = new ImageData(outW, outH)
        const target = out.data
        let changed = 0
        for (let i = 0; i < pixelsA.length; i += 4) {
          const diff = Math.max(Math.abs(pixelsA[i] - pixelsB[i]), Math.abs(pixelsA[i + 1] - pixelsB[i + 1]), Math.abs(pixelsA[i + 2] - pixelsB[i + 2]))
          if (diff > THRESHOLD) {
            changed++
            target[i] = 255; target[i + 1] = 45; target[i + 2] = 85; target[i + 3] = 255
          } else {
            // The new screenshot, faded to grey so the changes stand out.
            const grey = (pixelsB[i] * 0.3 + pixelsB[i + 1] * 0.59 + pixelsB[i + 2] * 0.11) * 0.35 + 255 * 0.65
            target[i] = grey; target[i + 1] = grey; target[i + 2] = grey; target[i + 3] = 255
          }
        }
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = outW
        canvas.height = outH
        canvas.getContext('2d')?.putImageData(out, 0, 0)
        finish({ state: 'done', changedPct: (changed / (outW * outH)) * 100, width: outW, height: outH })
      })
      .catch(err => finish({ state: 'failed', message: err instanceof Error ? err.message : 'Could not compare these screenshots' }))
    return () => { alive = false }
  }, [clientId, before, after])

  const widths = before.viewportW && after.viewportW && before.viewportW !== after.viewportW
    ? `Taken at different window widths (${before.viewportW}px and ${after.viewportW}px), so the layout may shift everywhere.`
    : ''

  return (
    <div className="ps-rv-diff">
      <p className="ps-rv-diff-summary">
        {current.state === 'loading' && 'Comparing…'}
        {current.state === 'failed' && current.message}
        {current.state === 'done' && (current.changedPct < 0.05
          ? 'No visible changes.'
          : <><strong>{current.changedPct < 1 ? current.changedPct.toFixed(1) : Math.round(current.changedPct)}%</strong> of the page changed. Changes are in red.</>)}
        {widths && <span className="ps-panel-hint"> {widths}</span>}
      </p>
      <canvas ref={canvasRef} className="ps-rv-diff-canvas" hidden={current.state !== 'done'} aria-label="Changed areas highlighted in red" />
    </div>
  )
}
