import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Bell, Moon, Sun, Shield, Globe } from 'lucide-react';
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

      {/* Profile */}
      <NeoTile style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{user?.name || 'Admin'}</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{user?.email || ''}</p>
        </div>
      </NeoTile>

      {/* Appearance */}
      <p className="maya-section-title">Appearance</p>
      <NeoTile style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <NeoIcon bg={isDark ? C.purpleS : C.orangeS} size={36} round={12}>
            {isDark
              ? <Moon size={18} color={C.purple} strokeWidth={2} />
              : <Sun size={18} color={C.orange} strokeWidth={2} />
            }
          </NeoIcon>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>App Theme</p>
            <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>
              {isDark ? 'Dark mode is active' : 'Light mode is active'}
            </p>
          </div>
          <NeoToggle value={isDark} onChange={toggle} ariaLabel="Toggle app theme" />
        </div>

        {/* Light / Dark selector chips */}
        <div style={{ display: 'flex', gap: 10 }}>
          <ThemeChip
            label="Light"
            icon={<Sun size={15} strokeWidth={2} />}
            active={!isDark}
            activeColor={C.orange}
            onClick={isDark ? toggle : undefined}
          />
          <ThemeChip
            label="Dark"
            icon={<Moon size={15} strokeWidth={2} />}
            active={isDark}
            activeColor={C.purple}
            onClick={!isDark ? toggle : undefined}
          />
        </div>
      </NeoTile>

      {/* General */}
      <p className="maya-section-title">General</p>
      <NeoTile style={{ padding: 0, overflow: 'hidden' }}>
        <ToggleRow
          icon={<Bell size={18} color={C.teal} strokeWidth={2} />}
          bg={C.tealS}
          label="Push Notifications"
          value={notif}
          onToggle={() => setNotif(!notif)}
          last
        />
      </NeoTile>

      {/* Account */}
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

function ThemeChip({ label, icon, active, activeColor, onClick }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  activeColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 0',
        borderRadius: 14,
        border: `2px solid ${active ? activeColor : 'transparent'}`,
        background: active ? `${activeColor}20` : 'rgba(128,128,128,0.08)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        fontSize: 14,
        fontWeight: 600,
        color: active ? activeColor : C.muted,
        outline: 'none',
      }}
    >
      {icon}
      {label}
    </button>
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
