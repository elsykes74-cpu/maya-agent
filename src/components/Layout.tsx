import { Outlet, useLocation, useNavigate } from 'react-router'
import { Home, Users, PhoneCall, Megaphone, LayoutGrid } from 'lucide-react'

const TABS = [
  {
    path: '/',
    label: 'Home',
    icon: Home,
    gradient: 'linear-gradient(160deg, #3395FF 0%, #007AFF 100%)',
    shadow: '0 8px 22px rgba(0,122,255,0.50), 0 2px 8px rgba(0,122,255,0.30)',
    color: '#007AFF',
  },
  {
    path: '/leads',
    label: 'Leads',
    icon: Users,
    gradient: 'linear-gradient(160deg, #FF6B61 0%, #FF3B30 100%)',
    shadow: '0 8px 22px rgba(255,59,48,0.50), 0 2px 8px rgba(255,59,48,0.30)',
    color: '#FF3B30',
  },
  {
    path: '/calls',
    label: 'Calls',
    icon: PhoneCall,
    gradient: 'linear-gradient(160deg, #4DD871 0%, #34C759 100%)',
    shadow: '0 8px 22px rgba(52,199,89,0.50), 0 2px 8px rgba(52,199,89,0.30)',
    color: '#34C759',
  },
  {
    path: '/campaigns',
    label: 'Campaigns',
    icon: Megaphone,
    gradient: 'linear-gradient(160deg, #FFB340 0%, #FF9500 100%)',
    shadow: '0 8px 22px rgba(255,149,0,0.50), 0 2px 8px rgba(255,149,0,0.30)',
    color: '#FF9500',
  },
  {
    path: '/more',
    label: 'More',
    icon: LayoutGrid,
    gradient: 'linear-gradient(160deg, #CC7EF5 0%, #AF52DE 100%)',
    shadow: '0 8px 22px rgba(175,82,222,0.50), 0 2px 8px rgba(175,82,222,0.30)',
    color: '#AF52DE',
  },
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
              <div
                className="tab-icon-box"
                style={active ? {
                  background: tab.gradient,
                  boxShadow: tab.shadow + ', inset 0 1px 0 rgba(255,255,255,0.25)',
                } : {}}
              >
                <Icon
                  size={23}
                  strokeWidth={active ? 2.5 : 2}
                  color={active ? '#FFFFFF' : '#9E9EA8'}
                />
              </div>
              <span style={active ? { color: tab.color } : {}}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
