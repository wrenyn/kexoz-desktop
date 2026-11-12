import { type ReactNode, useEffect } from 'react'

type Props = { children: ReactNode }

export default function AppShell({ children }: Props) {
  useEffect(() => {
    // Remove the pre-React splash only after the app has committed its first screen.
    document.getElementById('boot')?.remove()
    const closeMenus = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      document.querySelectorAll<HTMLDetailsElement>('.ps-header-more[open]').forEach(menu => {
        if (event instanceof KeyboardEvent || !(event.target instanceof Node) || !menu.contains(event.target)) {
          if (event instanceof KeyboardEvent && menu.contains(document.activeElement)) {
            event.preventDefault()
            menu.querySelector('summary')?.focus()
          }
          menu.open = false
        }
      })
    }
    const onAction = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null
      const menu = target?.closest<HTMLDetailsElement>('.ps-header-more')
      if (menu) menu.open = false
    }
    document.addEventListener('pointerdown', closeMenus)
    document.addEventListener('keydown', closeMenus)
    document.addEventListener('click', onAction)
    return () => {
      document.removeEventListener('pointerdown', closeMenus)
      document.removeEventListener('keydown', closeMenus)
      document.removeEventListener('click', onAction)
    }
  }, [])
  return (
    <div className="ps-root">
      {window.kexoz && <div className="ps-titlebar" />}
      {children}
    </div>
  )
}
