import QRCode from 'qrcode'
import { useEffect, useRef } from 'react'

export default function QrCodePopover({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 180,
        margin: 2,
        color: { dark: '#ffffff', light: '#00000000' },
      })
    }
  }, [url])

  return (
    <div className="ps-qr-popover" style={{ '--qr-bg': 'rgba(27, 30, 29, 0.98)' } as React.CSSProperties}>
      <canvas ref={canvasRef} />
      <div className="ps-qr-url">{url}</div>
    </div>
  )
}
