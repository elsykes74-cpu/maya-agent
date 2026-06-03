import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, TrendingUp, MessageSquare, Shield, Bot, Settings, LogOut } from 'lucide-react';
import { C, NeoTile, NeoIcon } from '@/components/Neo';

const ITEMS = [
  { icon: Calendar, label: 'Appointments', path: '/appointments', description: '2 upcoming', color: C.purple, bg: C.purpleS },
  { icon: TrendingUp, label: 'Deal Analysis', path: '/deals', description: 'MAO calculator', color: C.green, bg: C.greenS },
  { icon: MessageSquare, label: 'SMS Sequences', path: '/sms', description: '2 templates', color: C.blue, bg: C.blueS },
  { icon: Shield, label: 'DNC Lists', path: '/dnc', description: '3 numbers', color: C.red, bg: C.redS },
  { icon: Bot, label: 'AI Agent Config', path: '/ai-config', description: 'Voice, script & API keys', color: C.orange, bg: C.orangeS },
  { icon: Settings, label: 'Settings', path: '/settings', description: 'Account & preferences', color: C.muted, bg: '#F3F4F7' },
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

      <NeoTile style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, letterSpacing: '-0.02em', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{user?.name || 'User'}</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{user?.email || ''}</p>
        </div>
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
