import React from 'react'
import mark from '../../assets/kexoz-mark.png'

export default function Logo({ style, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={mark}
      alt="Kexoz"
      draggable={false}
      {...props}
      style={{ display: 'block', borderRadius: '22%', objectFit: 'cover', ...style }}
    />
  )
}
