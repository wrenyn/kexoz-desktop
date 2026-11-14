import type { SVGAttributes } from 'react'

type Props = SVGAttributes<SVGSVGElement> & {
  label?: string
}

export default function KexozMark({ label, className = '', ...props }: Props) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={`kexoz-mark ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      <rect className="kexoz-mark__tile" x="8" y="8" width="496" height="496" rx="124" />
      <rect className="kexoz-mark__edge" x="8" y="8" width="496" height="496" rx="124" pathLength="1" strokeLinecap="round" />
      <path className="kexoz-mark__letter" d="M140 116h76v118l116-118h96L278 266l156 130H328L216 300v96h-76V116Z" />
      <path className="kexoz-mark__signal" d="m216 226 46 40-46 40v-80Z" />
    </svg>
  )
}
