export type Page = 'dashboard' | 'tunnels' | 'projects' | 'review' | 'inbox' | 'requests' | 'domains' | 'settings'

// Sidebar navigation order; App maps Ctrl/Cmd+number onto it. Kept out of the
// component file so hot reload keeps working for the sidebar itself.
// Group 1 is everyday work, group 2 is setup; Settings lives in the sidebar footer.
// Projects come first: every share is created inside one.
export const NAV_ITEMS: { id: Page; label: string; shortcut: string; group: 1 | 2 | 0 }[] = [
  { id: 'projects',  label: 'Projects',   shortcut: '1', group: 1 },
  { id: 'dashboard', label: 'Overview',   shortcut: '2', group: 1 },
  { id: 'tunnels',   label: 'All shares', shortcut: '3', group: 1 },
  { id: 'review',    label: 'Review',     shortcut: '4', group: 1 },
  { id: 'inbox',     label: 'Inbox',      shortcut: '5', group: 1 },
  { id: 'requests',  label: 'Requests',   shortcut: '6', group: 1 },
  { id: 'domains',   label: 'Domains',    shortcut: '7', group: 2 },
  { id: 'settings',  label: 'Settings',   shortcut: '8', group: 0 },
]
