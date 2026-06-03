import { useNavigate } from 'react-router';
import { Shield, PhoneCall } from 'lucide-react';
import { C, NeoTile, NeoIcon, BackBtn } from '@/components/Neo';

const DNC_NUMBERS = ['(413) 555-0999', '(413) 555-0888', '(413) 555-0777'];

export default function DNCLists() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Do Not Call</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0', fontWeight: 500 }}>{DNC_NUMBERS.length} numbers on list</p>
        </div>
      </div>

      <NeoTile style={{ background: C.redS, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <NeoIcon bg="rgba(255,255,255,0.5)" size={40} round={14}><Shield size={20} color={C.red} strokeWidth={2} /></NeoIcon>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>TCPA Compliance</p>
            <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0', lineHeight: 1.5, fontWeight: 500 }}>
              Numbers on this list are automatically scrubbed before every campaign. These leads will never be called.
            </p>
          </div>
        </div>
      </NeoTile>

      {DNC_NUMBERS.map((num, i) => (
        <NeoTile key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, padding: 14 }}>
          <NeoIcon bg={C.redS} size={40} round={14}><PhoneCall size={18} color={C.red} strokeWidth={2} /></NeoIcon>
          <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{num}</p>
        </NeoTile>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}
