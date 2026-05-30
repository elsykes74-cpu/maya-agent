import { useNavigate } from 'react-router';
import { Clock, MapPin, User } from 'lucide-react';
import { C, NeoTile, NeoIcon, BackBtn } from '@/components/Neo';
import { APPOINTMENTS } from '@/data';

export default function Appointments() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Appointments</h1>
      </div>

      {APPOINTMENTS.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No appointments</p>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Schedule a walkthrough from a lead</p>
        </div>
      ) : APPOINTMENTS.map(a => (
        <NeoTile key={a.id} style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})` }}>
            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(a.scheduledDate).getDate()}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>{new Date(a.scheduledDate).toLocaleDateString('en-US', { month: 'short' })}</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>{a.title}</p>
            <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
              <User size={12} strokeWidth={2} /> {a.leadName}
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
              <Clock size={12} strokeWidth={2} />
              {new Date(a.scheduledDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              &nbsp;·&nbsp;
              <MapPin size={12} strokeWidth={2} /> {a.location}
            </p>
            {a.notes && (
              <div className="neo-pressed-sm" style={{ marginTop: 8, padding: 10 }}>
                <p style={{ fontSize: 12, color: C.muted, margin: 0, fontWeight: 500 }}>{a.notes}</p>
              </div>
            )}
          </div>
        </NeoTile>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}
