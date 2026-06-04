import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Bell, Moon, Shield, Globe } from 'lucide-react';
import { C, NeoTile, NeoIcon, NeoToggle, BackBtn } from '@/components/Neo';

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notif, setNotif] = useState(true);
  const { isDark, toggle } = useDarkMode();

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'AD';

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate('/more')} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Settings</h1>
      </div>

      <NeoTile style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{user?.name || 'Admin'}</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{user?.email || ''}</p>
        </div>
      </NeoTile>

      <p className="maya-section-title">General</p>
      <NeoTile style={{ padding: 0, overflow: 'hidden' }}>
        <ToggleRow icon={<Bell size={18} color={C.teal} strokeWidth={2} />} bg={C.tealS} label="Push Notifications" value={notif} onToggle={() => setNotif(!notif)} />
        <ToggleRow icon={<Moon size={18} color={C.purple} strokeWidth={2} />} bg={C.purpleS} label="Dark Mode" value={isDark} onToggle={toggle} last />
      </NeoTile>

      <p className="maya-section-title" style={{ marginTop: 24 }}>Account</p>
      <NeoTile style={{ padding: 0, overflow: 'hidden' }}>
        <LinkRow icon={<Shield size={18} color={C.teal} strokeWidth={2} />} bg={C.tealS} label="Privacy & Security" />
        <LinkRow icon={<Globe size={18} color={C.green} strokeWidth={2} />} bg={C.greenS} label="Language" detail="English" last />
      </NeoTile>

      <p style={{ textAlign: 'center', fontSize: 13, color: C.tertiary, marginTop: 28, fontWeight: 500 }}>Maya Agent v2.0.1</p>
      <div style={{ height: 20 }} />
    </div>
  );
}

function ToggleRow({ icon, bg, label, value, onToggle, last }: { icon: React.ReactNode; bg: string; label: string; value: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
      <NeoIcon bg={bg} size={36} round={12} style={{ marginRight: 14 }}>{icon}</NeoIcon>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.text }}>{label}</span>
      <NeoToggle value={value} onChange={onToggle} ariaLabel={label} />
    </div>
  );
}

function LinkRow({ icon, bg, label, detail, last }: { icon: React.ReactNode; bg: string; label: string; detail?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
      <NeoIcon bg={bg} size={36} round={12} style={{ marginRight: 14 }}>{icon}</NeoIcon>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.text }}>{label}</span>
      {detail && <span style={{ fontSize: 14, color: C.muted, marginRight: 8, fontWeight: 500 }}>{detail}</span>}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tertiary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  );
}
