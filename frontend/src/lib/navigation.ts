export type Page =
  | 'dashboard'
  | 'projects'
  | 'review'
  | 'team'
  | 'inbox'
  | 'requests'
  | 'domains'
  | 'settings'
  | 'account'

export type NavSection = 'workspace' | 'tools' | 'bottom'

// Sidebar navigation. App maps Ctrl/Cmd+number onto shortcut fields.
// Feedback lives here once — not inside share settings. Inbox is retired from the nav.
export const NAV_ITEMS: {
  id: Page
  label: string
  shortcut: string
  section: NavSection
}[] = [
  { id: 'dashboard', label: 'Overview', shortcut: '1', section: 'workspace' },
  { id: 'projects', label: 'Projects', shortcut: '2', section: 'workspace' },
  { id: 'review', label: 'Feedback', shortcut: '3', section: 'workspace' },
  { id: 'team', label: 'Team', shortcut: '4', section: 'workspace' },
  { id: 'domains', label: 'Domains', shortcut: '5', section: 'tools' },
  { id: 'requests', label: 'Traffic', shortcut: '6', section: 'tools' },
  { id: 'settings', label: 'Settings', shortcut: '7', section: 'bottom' },
  { id: 'account', label: 'Account', shortcut: '8', section: 'bottom' }, // account chip in sidebar, not a nav row
]

export const PAGE_IDS = new Set<Page>(NAV_ITEMS.map(item => item.id))

export const isPage = (value: string | null | undefined): value is Page =>
  !!value && PAGE_IDS.has(value as Page)
