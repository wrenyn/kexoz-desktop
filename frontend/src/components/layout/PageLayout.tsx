import { type ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageLayout({ title, subtitle, actions, children }: Props) {
  return (
    <div className="ps-main">
      <div className="ps-page-header animate-fade-down">
        <div>
          <h1 className="ps-page-title">{title}</h1>
          {subtitle && <p className="ps-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ps-header-actions">{actions}</div>}
      </div>
      <div className="ps-page-content">
        {children}
      </div>
    </div>
  )
}
