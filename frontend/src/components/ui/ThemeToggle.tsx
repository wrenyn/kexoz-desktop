import { Sun, Moon } from 'lucide-react'

type Props = {
  theme: 'light' | 'dark'
  onToggle: () => void
  compact?: boolean
}

export default function ThemeToggle({ theme, onToggle, compact = false }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ps-btn-icon"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={compact ? undefined : {
        width: '100%',
        justifyContent: 'flex-start',
        gap: 9,
        padding: '7px 10px',
        borderRadius: 'var(--radius-sm)',
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {theme === 'dark'
        ? <Sun size={15} strokeWidth={1.8} />
        : <Moon size={15} strokeWidth={1.8} />
      }
      {!compact && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
    </button>
  )
}
