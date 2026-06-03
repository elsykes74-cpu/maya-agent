import { useState } from 'react';
import { Plus, Users, PhoneCall, Pause, Play, Trash2, Megaphone } from 'lucide-react';
import { CAMPAIGNS as INITIAL } from '@/data';
import { C, NeoTile, NeoIcon, SectionTitle, CampaignStatusPill, ConfirmSheet } from '@/components/Neo';

type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft' | 'archived';

interface Campaign {
  id: number; name: string; description: string;
  status: CampaignStatus; progress: number; callsMade: number; totalLeads: number;
}

export default function Campaigns() {
  const [camps, setCamps] = useState<Campaign[]>(INITIAL as Campaign[]);
  const [show, setShow] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  const counts = {
    a: camps.filter(c => c.status === 'active').length,
    p: camps.filter(c => c.status === 'paused').length,
    d: camps.filter(c => c.status === 'completed').length,
  };

  const toggle = (id: number) => setCamps(prev => prev.map(c => c.id === id ? { ...c, status: (c.status === 'active' ? 'paused' : 'active') as CampaignStatus } : c));

  const remove = (id: number) => {
    const camp = camps.find(c => c.id === id);
    if (!camp) return;
    setConfirmData({
      title: 'Delete Campaign',
      desc: `Remove "${camp.name}"? All call history for this campaign will be lost.`,
      onConfirm: () => { setCamps(p => p.filter(c => c.id !== id)); setConfirmOpen(false); },
    });
    setConfirmOpen(true);
  };

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Campaigns</h1>
        <button onClick={() => setShow(true)} className="press-sm" aria-label="Create campaign" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <NeoIcon bg={C.tealS} size={48}><Plus size={22} color={C.teal} strokeWidth={2.5} /></NeoIcon>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <CampaignStatusPill count={counts.a} label="Active" color={C.green} />
        <CampaignStatusPill count={counts.p} label="Paused" color={C.orange} />
        <CampaignStatusPill count={counts.d} label="Done" color={C.blue} />
      </div>

      {camps.map(camp => (
        <NeoTile key={camp.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{camp.name}</p>
              <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', fontWeight: 500 }}>{camp.description}</p>
            </div>
            <span className={camp.status === 'active' ? 'maya-tag-hot' : camp.status === 'paused' ? 'maya-tag-warm' : 'maya-tag-cold'}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', flexShrink: 0 }}>
              {camp.status}
            </span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              <span style={{ color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progress</span>
              <span style={{ color: C.text }}>{camp.progress}%</span>
            </div>
            <div className="maya-progress-track">
              <div className="maya-progress-fill" style={{ width: `${camp.progress}%`, background: camp.status === 'active' ? `linear-gradient(90deg, ${C.teal}, ${C.green})` : camp.status === 'paused' ? C.orange : C.blue }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14, fontSize: 13, color: C.muted, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Users size={14} strokeWidth={2} /> {camp.totalLeads} leads</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><PhoneCall size={14} strokeWidth={2} /> {camp.callsMade} called</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => toggle(camp.id)} className="maya-tile press-sm" aria-label={camp.status === 'active' ? `Pause ${camp.name}` : `Resume ${camp.name}`} style={{ flex: 1, height: 44, borderRadius: 14, background: camp.status === 'active' ? C.orange : C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', padding: 0 }}>
              {camp.status === 'active' ? <><Pause size={16} strokeWidth={2.5} /> Pause</> : <><Play size={16} fill="white" strokeWidth={0} /> Resume</>}
            </button>
            <button onClick={() => remove(camp.id)} className="neo-pressed-sm press-sm" aria-label={`Delete ${camp.name}`} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Trash2 size={16} color={C.red} strokeWidth={2} />
            </button>
          </div>
        </NeoTile>
      ))}

      {camps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <NeoIcon bg={C.tealS} size={64} round={20} style={{ margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={28} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No campaigns</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 16px' }}>Tap + to create your first campaign</p>
          <button onClick={() => setShow(true)} className="maya-tile press-sm" style={{ padding: '12px 24px', borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} strokeWidth={2.5} /> New Campaign
          </button>
        </div>
      )}

      {show && <CreateSheet onClose={() => setShow(false)} onCreate={(d) => { setCamps(p => [...p, { ...d, id: Date.now(), status: 'active' as CampaignStatus, progress: 0, callsMade: 0, totalLeads: 0 }]); setShow(false); }} />}
      {confirmData && <ConfirmSheet open={confirmOpen} title={confirmData.title} desc={confirmData.desc} danger onConfirm={confirmData.onConfirm} onCancel={() => setConfirmOpen(false)} />}
      <div style={{ height: 20 }} />
    </div>
  );
}

function CreateSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (d: any) => void }) {
  const [n, setN] = useState('');
  const [d, setD] = useState('');
  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.3)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div className="neo-sheet" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: 28, borderRadius: '28px 28px 0 0' }}>
      <div style={{ width: 40, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 24px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 20px' }}>New Campaign</h2>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block' }}>Campaign Name</label>
        <input value={n} onChange={e => setN(e.target.value)} placeholder="e.g., Springfield Motivated Sellers" className="neo-input" />
      </div>
      <div style={{ marginBottom: 28 }}>
        <label style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block' }}>Description</label>
        <textarea value={d} onChange={e => setD(e.target.value)} placeholder="What is this campaign for?" rows={3} className="neo-textarea" />
      </div>
      <button onClick={() => n.trim() && onCreate({ name: n.trim(), description: d.trim() })} disabled={!n.trim()} className="maya-tile press-sm" style={{ width: '100%', height: 56, borderRadius: 18, background: C.teal, color: '#fff', border: 'none', fontSize: 17, fontWeight: 700, cursor: 'pointer', padding: 0, opacity: n.trim() ? 1 : 0.45 }}>
        Create Campaign
      </button>
      <button onClick={onClose} style={{ width: '100%', marginTop: 12, fontSize: 17, color: C.muted, background: 'none', border: 'none', padding: 12, cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
    </div>
  </>;
}
