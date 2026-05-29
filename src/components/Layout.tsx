import { Outlet, useLocation, useNavigate } from 'react-router'
import { Home, Users, PhoneCall, Megaphone, LayoutGrid } from 'lucide-react'

const TABS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/leads', label: 'Leads', icon: Users },
  { path: '/calls', label: 'Calls', icon: PhoneCall },
  { path: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { path: '/more', label: 'More', icon: LayoutGrid },
] as const

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="app-shell">
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-20">
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
            >
              <Icon strokeWidth={active ? 2.5 : 2} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
