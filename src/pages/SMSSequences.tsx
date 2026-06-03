import { useNavigate } from 'react-router';
import { C, NeoTile, BackBtn } from '@/components/Neo';

const TEMPLATES = [
  { name: 'Initial Outreach', body: "Hi {{name}}, I'm a local investor interested in buying your property at {{address}} for cash. I can close in 14 days as-is. Would you be open to a quick conversation?" },
  { name: 'Follow Up', body: "Hi {{name}}, following up on my message about your property. I have a cash offer ready — no repairs needed, no fees, close on your timeline. Can we talk for 5 minutes?" },
];

export default function SMSSequences() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>SMS Templates</h1>
      </div>

      {TEMPLATES.map((t, i) => (
        <NeoTile key={i} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>{t.name}</p>
          <div className="neo-pressed-sm" style={{ padding: 14 }}>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{t.body}</p>
          </div>
        </NeoTile>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}
