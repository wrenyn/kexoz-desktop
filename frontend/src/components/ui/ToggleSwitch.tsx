import type { ButtonHTMLAttributes } from 'react'

type ToggleSwitchProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean
}

export default function ToggleSwitch({ checked, className = '', ...props }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle-switch ${checked ? 'toggle-on' : ''} ${className}`.trim()}
      {...props}
    />
  )
}
