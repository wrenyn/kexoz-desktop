import { Activity, Globe, LayoutDashboard, Network, Settings } from 'lucide-react'

export type Page = 'dashboard' | 'tunnels' | 'requests' | 'domains' | 'settings'

// Sidebar navigation order; App maps Ctrl/Cmd+1…5 onto it. Kept out of the
// component file so hot reload keeps working for the sidebar itself.
export const NAV_ITEMS: { id: Page; label: string; icon: typeof LayoutDashboard; shortcut: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1' },
  { id: 'tunnels',   label: 'Shares',    icon: Network,         shortcut: '2' },
  { id: 'requests',  label: 'Requests',  icon: Activity,        shortcut: '3' },
  { id: 'domains',   label: 'Domains',   icon: Globe,           shortcut: '4' },
  { id: 'settings',  label: 'Settings',  icon: Settings,        shortcut: '5' },
]
