import type { ComponentProps } from 'react'
import KexozMark from './KexozMark'

export default function Logo(props: ComponentProps<typeof KexozMark>) {
  return <KexozMark {...props} />
}
