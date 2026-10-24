import { type ReactNode } from 'react'

type Props = { children: ReactNode }

export default function AppShell({ children }: Props) {
  return <div className="ps-root">{children}</div>
}
