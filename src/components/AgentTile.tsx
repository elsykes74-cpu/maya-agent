import { C, AGENT_ICONS, MayaIconBadge } from './Neo';
import type { AgentData } from './Neo';
import type { CSSProperties } from 'react';

interface AgentTileProps extends Partial<AgentData> {
  isLoading?: boolean;
  isDisabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function AgentTile({ title = 'Agent', description, icon = 'Zap', iconColor = C.teal, iconBg = C.tealS, tileBg = 'light', status, count, lastRun, isLoading, isDisabled, onClick, className = '', style }: AgentTileProps) {
  if (isLoading) {
    return <div className="maya-tile" style={{ padding: 20, height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, ...style }}>
      <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 18 }} />
      <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 6 }} />
    </div>;
  }

  const IconComponent = AGENT_ICONS[icon] || AGENT_ICONS['Zap'];
  const isDark = tileBg === 'dark';
  const textColor = isDark ? '#FFFFFF' : C.text;
  const mutedColor = isDark ? 'rgba(255,255,255,0.55)' : C.muted;

  return (
    <button
      onClick={() => { if (!isDisabled && onClick) onClick(); }}
      disabled={isDisabled}
      className={`${isDark ? 'maya-tile-dark' : 'maya-tile'} fade-in ${className}`}
      aria-label={`${title} agent${status ? `, ${status}` : ''}${isDisabled ? ', disabled' : ''}`}
      style={{ padding: 0, height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, position: 'relative', border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.5 : 1, width: '100%', ...style }}
    >
      {status && (
        <span style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: status === 'online' ? C.green : status === 'busy' ? C.orange : status === 'paused' ? C.blue : C.muted, boxShadow: `0 0 0 3px ${status === 'online' ? 'rgba(52,199,89,0.25)' : 'rgba(142,142,147,0.15)'}`, animation: status === 'online' ? 'mayaPulse 2.5s ease-in-out infinite' : 'none', zIndex: 2 }} />
      )}
      {typeof count === 'number' && count > 0 && (
        <span style={{ position: 'absolute', top: 10, right: 10, minWidth: 22, height: 22, borderRadius: 11, background: C.teal, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', boxShadow: '0 2px 8px rgba(20,184,166,0.3)', zIndex: 2 }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      <MayaIconBadge bg={iconBg}>
        <IconComponent size={26} color={iconColor} strokeWidth={2} />
      </MayaIconBadge>
      <span style={{ fontSize: 13, fontWeight: 600, color: textColor, textAlign: 'center', padding: '0 8px', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{title}</span>
      {lastRun && <span style={{ fontSize: 11, color: mutedColor, fontWeight: 500 }}>{lastRun}</span>}
    </button>
  );
}
