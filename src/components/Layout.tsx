import { Outlet, useLocation, Link } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  Home,
  Users,
  Phone,
  Calendar,
  Calculator,
  Bot,
  MessageSquare,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Rocket,
  Shield,
  Radio,
  SlidersHorizontal,
  Target,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/leads', label: 'Leads', icon: Users },
  { path: '/lead-finder', label: 'Lead Finder Bot', icon: Target },
  { path: '/campaigns', label: 'Campaigns', icon: Rocket },
  { path: '/call-queue', label: 'Live Monitor', icon: Radio },
  { path: '/calls', label: 'Call Center', icon: Phone },
  { path: '/appointments', label: 'Appointments', icon: Calendar },
  { path: '/deals', label: 'Deal Analysis', icon: Calculator },
  { path: '/ai-config', label: 'AI Agent', icon: Bot },
  { path: '/sms', label: 'SMS Sequences', icon: MessageSquare },
  { path: '/dnc', label: 'DNC & Scrub', icon: Shield },
  { path: '/settings', label: 'Settings', icon: SlidersHorizontal },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-slate-900 dark:bg-slate-900 text-white transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight">AI Calling</span>
              <span className="text-xs text-slate-400">Western Massachusetts</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </Link>
              )
            })}
          </nav>

          {/* User */}
          {user && (
            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name || ''} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-sm font-bold">
                    {user.name?.[0] || 'E'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name || 'Erick'}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Top Bar */}
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-500"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {navItems.find((n) => n.path === location.pathname)?.label || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
              Western Massachusetts Wholesaling
            </span>
          </div>
        </div>

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
