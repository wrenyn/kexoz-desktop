export type Page = 'dashboard' | 'tunnels' | 'projects' | 'requests' | 'feedback' | 'domains' | 'settings'

// Sidebar navigation order; App maps Ctrl/Cmd+number onto it. Kept out of the
// component file so hot reload keeps working for the sidebar itself.
export const NAV_ITEMS: { id: Page; label: string; shortcut: string }[] = [
  { id: 'dashboard', label: 'Dashboard', shortcut: '1' },
  { id: 'tunnels',   label: 'Shares',    shortcut: '2' },
  { id: 'projects',  label: 'Projects',  shortcut: '3' },
  { id: 'requests',  label: 'Requests',  shortcut: '4' },
  { id: 'feedback',  label: 'Feedback',  shortcut: '5' },
  { id: 'domains',   label: 'Domains',   shortcut: '6' },
  { id: 'settings',  label: 'Settings',  shortcut: '7' },
]
