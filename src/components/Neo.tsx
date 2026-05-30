import type { ReactNode, CSSProperties } from 'react';
import { Instagram, Camera, Users, MessageCircle, Facebook, Workflow, Mail, Phone, Zap, Calendar, Flame, TrendingUp, Bot, Shield, Settings, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const AGENT_ICONS: Record<string, LucideIcon> = { Instagram, Camera, Users, MessageCircle, Facebook, Workflow, Mail, Phone, Zap, Calendar, Flame, TrendingUp, Bot, Shield, Settings, LogOut };

export interface AgentData {
  id: string; title: string; description?: string; icon: string;
  iconColor?: string; iconBg?: string; tileBg?: 'light' | 'dark';
  status?: 'online' | 'offline' | 'busy' | 'paused'; accent?: string;
  count?: number; lastRun?: string; href?: string; onClick?: () => void;
}

const LIGHT: Record<string, string> = {
  text: '#1A1D26', sec: '#8E92A0', ter: '#B8BCC8',
  muted: '#8E92A0', tertiary: '#B8BCC8',
  teal: '#14B8A6', tealL: '#D1FAEE', tealS: '#F0FDF9',
  green: '#34C759', greenL: '#D4F8E0', greenS: '#F0FFF5',
  red: '#FF3B30', redL: '#FED7D7', redS: '#FFF5F5',
  orange: '#FF9F0A', orangeL: '#FEEBC8', orangeS: '#FFFBF0',
  purple: '#8B5CF6', purpleL: '#E9D8FD', purpleS: '#FAF5FF',
  blue: '#3B82F6', blueL: '#DBEAFE', blueS: '#EFF6FF',
  pink: '#EC4899', pinkL: '#FCE7F3', pinkS: '#FFF0F7',
  yellow: '#F59E0B', yellowL: '#FEF3C7', yellowS: '#FFFCF0',
  bg: '#EDEEF2', surface: '#FFFFFF',
};

const DARK: Record<string, string> = {
  text: '#E8EAF0', sec: '#8B8FA4', ter: '#5A5F78',
  muted: '#8B8FA4', tertiary: '#5A5F78',
  teal: '#2DD4BF', tealL: 'rgba(45,212,191,0.15)', tealS: 'rgba(45,212,191,0.08)',
  green: '#34D399', greenL: 'rgba(52,211,153,0.15)', greenS: 'rgba(52,211,153,0.08)',
  red: '#FF6B6B', redL: 'rgba(255,107,107,0.15)', redS: 'rgba(255,107,107,0.08)',
  orange: '#FFB84D', orangeL: 'rgba(255,184,77,0.15)', orangeS: 'rgba(255,184,77,0.08)',
  purple: '#A78BFA', purpleL: 'rgba(167,139,250,0.15)', purpleS: 'rgba(167,139,250,0.08)',
  blue: '#60A5FA', blueL: 'rgba(96,165,250,0.15)', blueS: 'rgba(96,165,250,0.08)',
  pink: '#F472B6', pinkL: 'rgba(244,114,182,0.15)', pinkS: 'rgba(244,114,182,0.08)',
  yellow: '#FCD34D', yellowL: 'rgba(252,211,77,0.15)', yellowS: 'rgba(252,211,77,0.08)',
  bg: '#0D0F17', surface: '#1A1D2E',
};

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
}

export const C = new Proxy(LIGHT as any, {
  get(_, prop: string) {
    const src = isDarkMode() ? DARK : LIGHT;
    return src[prop] ?? LIGHT[prop];
  },
}) as typeof LIGHT & { muted: string; tertiary: string };

export function NeoTile({ children, style, onClick, className = '' }: { children: ReactNode; style?: CSSProperties; onClick?: () => void; className?: string }) {
  return <div className={`neo-raised ${className}`} style={{ padding: 20, ...style }} onClick={onClick}>{children}</div>;
}

export function NeoTileSm({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return <div className="neo-raised-sm" style={{ padding: 16, ...style }} onClick={onClick}>{children}</div>;
}

export function BadgeFloat({ children, bg, size = 44, style }: { children: ReactNode; bg: string; size?: number; style?: CSSProperties }) {
  return <div className="badge-float" style={{ width: size, height: size, background: bg, fontSize: size > 48 ? 22 : 16, ...style }}>{children}</div>;
}

export function BadgeDot({ count, bg = C.red }: { count: number; bg?: string }) {
  return <span className="badge-float badge-float-sm" style={{ background: bg, fontSize: 11 }}>{count > 99 ? '99+' : count}</span>;
}

export function NeoIcon({ children, bg, size = 48, round, style }: { children: ReactNode; bg: string; size?: number; round?: number; style?: CSSProperties }) {
  return <div className="neo-icon-circle" style={{ width: size, height: size, background: bg, borderRadius: round ?? 16, ...style }}>{children}</div>;
}

export function MayaIconBadge({ children, bg, size = 56, round }: { children: ReactNode; bg: string; size?: number; round?: number }) {
  return <div className="maya-icon-badge" style={{ width: size, height: size, background: bg, borderRadius: round ?? 18 }}>{children}</div>;
}

export function Icon3D({ children, bg, size = 48 }: { children: ReactNode; bg: string; size?: number }) {
  return <div className="icon-3d" style={{ width: size, height: size, background: bg }}>{children}</div>;
}

export function NeoButton({ children, onClick, bg = C.green, color = '#fff', style, ariaLabel }: { children: ReactNode; onClick?: () => void; bg?: string; color?: string; style?: CSSProperties; ariaLabel?: string }) {
  return <button onClick={onClick} aria-label={ariaLabel} className="maya-tile press-sm" style={{ width: '100%', height: 56, borderRadius: 20, background: bg, color, border: 'none', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', padding: 0, ...style }}>{children}</button>;
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <p className="maya-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{children}</p>;
}

export function BackBtn({ onClick, label = 'Go back' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="card-pressed press-sm" aria-label={label} style={{ width: 40, height: 40, borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    </button>
  );
}

export function NeoToggle({ value, onChange, ariaLabel }: { value: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <div
      className={`toggle-3d ${value ? 'active' : ''}`}
      role="switch" aria-checked={value} aria-label={ariaLabel} tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!value); } }}
      style={{ outline: 'none' }}
    >
      <div className="toggle-thumb" />
    </div>
  );
}

export function Progress3D({ value, bg }: { value: number; bg?: string }) {
  return <div className="maya-progress-track"><div className="maya-progress-fill" style={{ width: `${value}%`, background: bg }} /></div>;
}

export function MotTag({ level }: { level: string }) {
  const cls = level === 'hot' ? 'maya-tag-hot' : level === 'warm' ? 'maya-tag-warm' : 'maya-tag-cold';
  return <span className={cls} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{level === 'hot' && '🔥'}{level}</span>;
}

export function QTag({ icon, label, value, bg }: { icon: ReactNode; label: string; value: string; bg: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: bg, borderRadius: 14 }}>{icon}<div><p style={{ fontSize: 10, color: C.sec, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, fontWeight: 600 }}>{label}</p><p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '1px 0 0' }}>{value}</p></div></div>;
}

export function HomeDot({ color }: { color: string }) {
  return <div style={{ width: 16, height: 16, borderRadius: 5, background: color, opacity: 0.85 }} />;
}

export function BRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 15, color: C.sec }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: value >= 0 ? C.green : C.red }}>
        {value >= 0 ? '' : '-'}${Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}

export function StatPill({ icon, value, label, bg }: { icon: ReactNode; value: number; label: string; bg: string }) {
  return <div className="neo-pressed-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 14 }}>
    <div style={{ marginBottom: 6 }}>{icon}</div>
    <p style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>{value}</p>
    <p style={{ fontSize: 11, color: C.sec, margin: '2px 0 0', fontWeight: 600 }}>{label}</p>
  </div>;
}

export function StatusPill({ status, label }: { status: 'online' | 'offline' | 'busy' | 'paused'; label?: string }) {
  const cfg: Record<string, { bg: string; color: string; dot: string }> = {
    online: { bg: 'rgba(52,199,89,0.1)', color: '#34C759', dot: '#34C759' },
    offline: { bg: 'rgba(142,142,147,0.1)', color: '#8E92A0', dot: '#8E92A0' },
    busy: { bg: 'rgba(255,159,10,0.1)', color: '#FF9F0A', dot: '#FF9F0A' },
    paused: { bg: 'rgba(10,132,255,0.1)', color: '#0A84FF', dot: '#0A84FF' },
  };
  const c = cfg[status];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.dot}20` }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, boxShadow: `0 0 0 3px ${c.dot}30`, animation: status === 'online' ? 'mayaPulse 2.5s ease-in-out infinite' : 'none' }} />
    {label || status}
  </span>;
}

export function CampaignStatusPill({ count, label, color }: { count: number; label: string; color: string }) {
  return <div className="neo-pressed-sm" style={{ flex: 1, padding: 16, textAlign: 'center' }}>
    <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, margin: '0 auto 10px' }} />
    <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0 }}>{count}</p>
    <p style={{ fontSize: 12, color: C.sec, margin: '4px 0 0', fontWeight: 600 }}>{label}</p>
  </div>;
}

export function ConfirmSheet({ open, title, desc, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: { open: boolean; title: string; desc: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,38,0.35)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onCancel} />
    <div className="neo-sheet" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: 28 }}>
      <div style={{ width: 40, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 20px' }} />
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: danger ? C.redS : C.orangeS, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          {danger
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          }
        </div>
        <h3 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>{title}</h3>
        <p style={{ fontSize: 14, color: C.sec, margin: 0, lineHeight: 1.5 }}>{desc}</p>
      </div>
      <button className="maya-tile press-sm" onClick={onConfirm} style={{ width: '100%', height: 50, borderRadius: 16, background: danger ? C.red : C.teal, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: 0 }}>{confirmLabel}</button>
      <button onClick={onCancel} style={{ width: '100%', marginTop: 10, height: 44, borderRadius: 16, background: 'transparent', color: C.sec, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{cancelLabel}</button>
    </div>
  </>;
}
