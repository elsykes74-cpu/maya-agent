import { Outlet, useLocation, useNavigate } from 'react-router'
import { Home, Users, PhoneCall, Megaphone, LayoutGrid, Eye } from 'lucide-react'
import { SpheresBackground } from './SpheresBackground'
import { isPublicPreview } from '@/lib/preview'

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
        {isPublicPreview && (
          <div
            role="status"
            style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 14px', background: 'linear-gradient(135deg, #0D9488, #2563EB)', color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', boxShadow: '0 4px 16px rgba(15,118,110,0.2)' }}
          >
            <Eye size={15} aria-hidden="true" />
            PUBLIC PREVIEW · Protected actions are disabled
          </div>
        )}
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
