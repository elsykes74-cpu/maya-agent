import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Wrench, DollarSign, Percent } from 'lucide-react';
import { C, NeoTile, BackBtn, BRow, HomeDot } from '@/components/Neo';

export default function DealAnalysis() {
  const navigate = useNavigate();
  const [arv, setArv] = useState('');
  const [rep, setRep] = useState('');
  const [fee, setFee] = useState('5000');
  const [pct, setPct] = useState('70');

  const a = parseFloat(arv) || 0;
  const r = parseFloat(rep) || 0;
  const f = parseFloat(fee) || 0;
  const p = parseFloat(pct) || 70;
  const mao = a * (p / 100) - r - f;
  const mx = a * (p / 100);

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Deal Calculator</h1>
      </div>

      <NeoTile style={{ background: `linear-gradient(135deg, ${C.teal}, ${C.green})`, textAlign: 'center', color: '#fff', marginBottom: 24, padding: 28 }}>
        <p style={{ fontSize: 13, opacity: 0.75, margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Maximum Allowable Offer</p>
        <p style={{ fontSize: 44, fontWeight: 800, margin: '8px 0 0', letterSpacing: '-1.5px' }}>
          {a > 0 ? `$${Math.floor(mao).toLocaleString()}` : '$0'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 16 }}>
          <div>
            <p style={{ fontSize: 12, opacity: 0.65, margin: 0, fontWeight: 500 }}>ARV x {p}%</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 0' }}>${Math.floor(mx).toLocaleString()}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, opacity: 0.65, margin: 0, fontWeight: 500 }}>Your Profit</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 0' }}>${f.toLocaleString()}</p>
          </div>
        </div>
      </NeoTile>

      {[
        { l: 'After Repair Value (ARV)', icon: <HomeDot color={C.blue} />, v: arv, set: setArv, prefix: '$', ph: '300,000' },
        { l: 'Estimated Repairs', icon: <Wrench size={18} color={C.orange} strokeWidth={2} />, v: rep, set: setRep, prefix: '$', ph: '25,000' },
        { l: 'Assignment Fee', icon: <DollarSign size={18} color={C.green} strokeWidth={2} />, v: fee, set: setFee, prefix: '$', ph: '5,000' },
        { l: 'Investor Margin', icon: <Percent size={18} color={C.purple} strokeWidth={2} />, v: pct, set: setPct, prefix: '', ph: '70', suffix: '%' },
      ].map((fd, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.muted }}>{fd.icon}</span>{fd.l}
          </label>
          <div className="neo-input" style={{ display: 'flex', alignItems: 'center', height: 56 }}>
            {fd.prefix && <span style={{ fontSize: 18, color: C.muted, marginRight: 4, fontWeight: 500 }}>{fd.prefix}</span>}
            <input
              type="number"
              value={fd.v}
              onChange={e => fd.set(e.target.value)}
              placeholder={fd.ph}
              aria-label={fd.l}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 20, fontWeight: 700, background: 'transparent', color: C.text }}
            />
            {fd.suffix && <span style={{ fontSize: 18, color: C.muted, fontWeight: 500 }}>{fd.suffix}</span>}
          </div>
        </div>
      ))}

      {a > 0 && (
        <NeoTile>
          <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text }}>Deal Breakdown</p>
          <BRow label="After Repair Value" value={a} />
          <BRow label={`Investor Purchase (${p}%)`} value={-mx} />
          <BRow label="Repairs" value={-r} />
          <BRow label="Assignment Fee" value={-f} />
          <div style={{ borderTop: '2px solid rgba(0,0,0,0.06)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>MAO (Your Max Offer)</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.teal }}>${Math.floor(mao).toLocaleString()}</span>
            </div>
          </div>
        </NeoTile>
      )}
      <div style={{ height: 20 }} />
    </div>
  );
}
