export type Page = 'dashboard' | 'tunnels' | 'requests' | 'domains' | 'settings'

// Sidebar navigation order; App maps Ctrl/Cmd+1…5 onto it. Kept out of the
// component file so hot reload keeps working for the sidebar itself.
export const NAV_ITEMS: { id: Page; label: string; shortcut: string }[] = [
  { id: 'dashboard', label: 'Dashboard', shortcut: '1' },
  { id: 'tunnels',   label: 'Shares',    shortcut: '2' },
  { id: 'requests',  label: 'Requests',  shortcut: '3' },
  { id: 'domains',   label: 'Domains',   shortcut: '4' },
  { id: 'settings',  label: 'Settings',  shortcut: '5' },
]
