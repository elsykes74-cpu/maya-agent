import { C, StatusPill } from './Neo';
import type { ReactNode } from 'react';

interface HeaderProps {
  greeting?: string;
  title?: string;
  subtitle?: string;
  status?: 'online' | 'offline' | 'busy' | 'paused';
  statusLabel?: string;
  right?: ReactNode;
  compact?: boolean;
}

export function MayaHeader({ greeting, title = 'Maya', subtitle, status, statusLabel, right, compact = false }: HeaderProps) {
  return (
    <header style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: compact ? 16 : 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {greeting && <p style={{ fontSize: 15, color: C.muted, margin: '0 0 2px', fontWeight: 500, letterSpacing: '-0.01em' }}>{greeting}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: compact ? 26 : 32, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{title}</h1>
          {status && <StatusPill status={status} label={statusLabel} />}
        </div>
        {subtitle && !compact && <p style={{ fontSize: 15, color: C.muted, margin: '6px 0 0', fontWeight: 500 }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </header>
  );
}

export function QuickActionBar({ actions }: { actions: { label: string; icon: ReactNode; bg: string; color?: string; onClick?: () => void }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 24 }} className="hide-scrollbar">
      {actions.map((a, i) => (
        <button key={i} className="maya-tile press-sm" onClick={a.onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 18, background: a.bg, color: a.color || '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {a.icon}{a.label}
        </button>
      ))}
    </div>
  );
}
