import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, TrendingUp, MessageSquare, Shield, Bot, Settings, LogOut, Search, BarChart3 } from 'lucide-react';
import { C, NeoTile, NeoIcon } from '@/components/Neo';

const ITEMS = [
  { icon: BarChart3, label: 'Analytics', path: '/analytics', description: 'Live performance dashboard', color: C.teal, bg: C.tealS },
  { icon: Calendar, label: 'Appointments', path: '/appointments', description: 'Scheduled walkthroughs', color: C.purple, bg: C.purpleS },
  { icon: Search, label: 'Lead Finder', path: '/lead-finder', description: 'Find motivated sellers', color: C.blue, bg: C.blueS },
  { icon: TrendingUp, label: 'Deal Analysis', path: '/deals', description: 'MAO calculator', color: C.green, bg: C.greenS },
  { icon: MessageSquare, label: 'SMS Sequences', path: '/sms', description: '2 templates', color: C.blue, bg: C.blueS },
  { icon: Shield, label: 'DNC Lists', path: '/dnc', description: '3 numbers', color: C.red, bg: C.redS },
  { icon: Bot, label: 'AI Agent Config', path: '/ai-config', description: 'Voice, script & API keys', color: C.orange, bg: C.orangeS },
  { icon: Settings, label: 'Settings', path: '/settings', description: 'Account & preferences', color: C.muted, bg: C.surface },
];

export default function More() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>More</h1>

      <NeoTile style={{ marginTop: 20, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: user ? 12 : 0 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: '#111' }}>
            <img src="/maya-logo.jpg" alt="Maya" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{user?.name || 'Demo Mode'}</p>
            <p style={{ fontSize: 14, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{user?.email || 'Sign in for cloud sync'}</p>
          </div>
          {user?.role && (
            <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em', background: user.role === 'admin' ? C.purpleS : C.tealS, color: user.role === 'admin' ? C.purple : C.teal }}>
              {user.role}
            </span>
          )}
        </div>
        {user && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: C.greenS, textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: 0 }}>● Live</p>
            </div>
            <div style={{ flex: 1, padding: '10px', borderRadius: 12, background: C.tealS, textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sync</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.teal, margin: 0 }}>Supabase</p>
            </div>
          </div>
        )}
      </NeoTile>

      <p className="maya-section-title" style={{ marginTop: 28 }}>Tools</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.path + it.label} onClick={() => navigate(it.path)} className="maya-card press-sm" aria-label={it.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: 'none', cursor: 'pointer', borderRadius: 20, textAlign: 'left', width: '100%' }}>
              <NeoIcon bg={it.bg} size={44} round={14}><Icon size={20} color={it.color} strokeWidth={2} /></NeoIcon>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{it.label}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{it.description}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          );
        })}
      </div>

      <button onClick={logout} className="maya-tile press-sm" aria-label="Sign out" style={{ width: '100%', marginTop: 24, height: 54, borderRadius: 18, background: C.red, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', padding: 0, boxShadow: `0 6px 20px ${C.red}25` }}>
        <LogOut size={18} strokeWidth={2} /> Sign Out
      </button>
      <div style={{ height: 20 }} />
    </div>
  );
}
