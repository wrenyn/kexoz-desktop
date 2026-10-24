import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  suffix?: string
  helpText?: string
}

export default function Input({ label, suffix, helpText, id, className = '', ...props }: InputProps) {
  return (
    <>
      {label && <label htmlFor={id}>{label}</label>}
      {suffix ? (
        <div className="field-with-suffix">
          <input id={id} className={className} {...props} />
          <span>{suffix}</span>
        </div>
      ) : (
        <input id={id} className={className} {...props} />
      )}
      {helpText && <p className="field-help">{helpText}</p>}
    </>
  )
}
