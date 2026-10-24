import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  jumbo?: boolean
  children: ReactNode
}

export default function Button({ variant = 'primary', jumbo = false, children, className = '', ...props }: ButtonProps) {
  const baseClass = variant === 'primary' ? 'primary-btn' : 'secondary-btn'
  const jumboClass = jumbo ? 'jumbo' : ''
  return (
    <button className={`${baseClass} ${jumboClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  )
}
