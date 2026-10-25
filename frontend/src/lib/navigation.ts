export type Page = 'dashboard' | 'tunnels' | 'requests' | 'domains' | 'settings'

// Sidebar navigation order; App maps Ctrl/Cmd+number onto it. Kept out of the
// component file so hot reload keeps working for the sidebar itself.
// Group 1 is everyday work, group 2 is setup; Settings lives in the sidebar footer.
export const NAV_ITEMS: { id: Page; label: string; shortcut: string; group: 1 | 2 | 0 }[] = [
  { id: 'dashboard', label: 'Dashboard', shortcut: '1', group: 1 },
  { id: 'tunnels',   label: 'Shares',    shortcut: '2', group: 1 },
  { id: 'requests',  label: 'Requests',  shortcut: '3', group: 1 },
  { id: 'domains',   label: 'Domains',   shortcut: '4', group: 2 },
  { id: 'settings',  label: 'Settings',  shortcut: '5', group: 0 },
]
