import { Outlet, useLocation, useNavigate } from 'react-router'
import { Home, Users, PhoneCall, Megaphone, LayoutGrid } from 'lucide-react'
import { SpheresBackground } from './SpheresBackground'

const TABS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/leads', label: 'Leads', icon: Users },
  { path: '/calls', label: 'Calls', icon: PhoneCall },
  { path: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { path: '/more', label: 'More', icon: LayoutGrid },
] as const

const MORE_ROUTES = new Set([
  '/more', '/appointments', '/deals', '/ai-config', '/sms', '/dnc', '/settings',
])

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/more') return MORE_ROUTES.has(location.pathname)
    return location.pathname.startsWith(path)
  }

  return (
    <div className="app-shell">
      <SpheresBackground />
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        <Outlet />
      </main>

      <nav className="tab-bar">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab.path)
          return (
            <button
              key={tab.path}
              className={`tab-item ${active ? 'active' : ''}`}
              onClick={() => navigate(tab.path)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 2} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
