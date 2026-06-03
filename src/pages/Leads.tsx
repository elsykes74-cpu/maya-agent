import { useState, useEffect } from 'react';
import { Search, Plus, PhoneCall, MapPin, Clock, Banknote, Wrench, Thermometer, Bot, Sparkles } from 'lucide-react';
import { C, NeoTile, NeoIcon, MotTag, QTag, HomeDot, ConfirmSheet } from '@/components/Neo';
import { loadLeads, saveLeads, addCallRecord, getNextId } from '@/lib/persistence';
import type { Lead } from '@/lib/persistence';

export default function Leads() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  useEffect(() => { setLeads(loadLeads()); }, []);
  useEffect(() => { if (leads.length > 0) saveLeads(leads); }, [leads]);

  const filtered = search
    ? leads.filter(l => l.sellerName.toLowerCase().includes(search.toLowerCase()) || l.propertyAddress.toLowerCase().includes(search.toLowerCase()))
    : filter === 'all' ? leads : leads.filter(l => l.motivationLevel === filter);

  const tabs = [
    { k: 'all', l: 'All', n: leads.length },
    { k: 'hot', l: '🔥 Hot', n: leads.filter(l => l.motivationLevel === 'hot').length },
    { k: 'warm', l: 'Warm', n: leads.filter(l => l.motivationLevel === 'warm').length },
    { k: 'cold', l: 'Cold', n: leads.filter(l => l.motivationLevel === 'cold').length },
  ];

  const deleteLead = (id: number) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    setConfirmData({
      title: 'Delete Lead',
      desc: `Remove ${lead.sellerName} from your leads? This cannot be undone.`,
      onConfirm: () => { setLeads(p => p.filter(l => l.id !== id)); setConfirmOpen(false); },
    });
    setConfirmOpen(true);
  };

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Leads</h1>
        <button onClick={() => setShowAdd(true)} className="press-sm" aria-label="Add new lead" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <NeoIcon bg={C.tealS} size={48}><Plus size={22} color={C.teal} strokeWidth={2.5} /></NeoIcon>
        </button>
      </div>

      <div className="neo-search" style={{ marginBottom: 16 }}>
        <Search size={18} color={C.muted} strokeWidth={2} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." aria-label="Search leads" />
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20 }} className="hide-scrollbar">
        {tabs.map(t => (
          <button key={t.k} onClick={() => setFilter(t.k)}
            className={`${filter === t.k ? 'neo-pressed' : 'neo-raised-sm'} press-sm`}
            aria-pressed={filter === t.k}
            style={{ padding: '10px 18px', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', color: filter === t.k ? C.teal : C.muted, borderRadius: 16 }}>
            {t.l} <span style={{ opacity: 0.6 }}>({t.n})</span>
          </button>
        ))}
      </div>

      {filtered.map(l => (
        <LeadCard key={l.id} lead={l} onDelete={() => deleteLead(l.id)} onCallRecord={(rec) => { addCallRecord(rec); }} />
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <NeoIcon bg={C.tealS} size={64} round={20} style={{ margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Search size={28} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No leads found</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 16px' }}>Try adjusting filters or add a new lead</p>
          <button onClick={() => setShowAdd(true)} className="maya-tile press-sm" style={{ padding: '12px 24px', borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} strokeWidth={2.5} /> Add Lead
          </button>
        </div>
      )}

      <div style={{ height: 20 }} />

      {showAdd && <AddLeadSheet onClose={() => setShowAdd(false)} onAdd={(lead) => { setLeads(p => [lead, ...p]); setShowAdd(false); }} />}
      {confirmData && <ConfirmSheet open={confirmOpen} title={confirmData.title} desc={confirmData.desc} danger onConfirm={confirmData.onConfirm} onCancel={() => setConfirmOpen(false)} />}
    </div>
  );
}

function LeadCard({ lead, onDelete, onCallRecord }: { lead: Lead; onDelete: () => void; onCallRecord: (r: any) => void }) {
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const callWithMaya = async () => {
    setCalling(true);
    setCallResult(null);
    try {
      const res = await fetch('/api/trpc/maya.placeCall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { to: lead.phone, name: lead.sellerName, address: lead.propertyAddress } }),
        credentials: 'include',
      });
      const data = await res.json();
      const sid = data?.result?.data?.json?.sid;
      if (sid) {
        onCallRecord({ id: Date.now(), leadName: lead.sellerName, phone: lead.phone, outcome: 'connected', duration: 0, transcript: `Maya called ${lead.sellerName}`, notes: null, createdAt: new Date().toISOString() });
        setCallResult({ ok: true, msg: `Call placed! SID: ${sid.slice(0, 12)}...` });
      } else {
        throw new Error(data?.error?.message || 'Call failed');
      }
    } catch (e: any) {
      setCallResult({ ok: false, msg: e.message || 'Call failed — check Twilio settings' });
    }
    setCalling(false);
  };

  return (
    <NeoTile style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{lead.sellerName}</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
            <MapPin size={12} strokeWidth={2} /> {lead.propertyAddress}
          </p>
        </div>
        <MotTag level={lead.motivationLevel} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        {lead.timeline && <QTag icon={<Clock size={14} color={C.blue} strokeWidth={2} />} label="Timeline" value={lead.timeline} bg={C.blueS} />}
        {lead.askingPrice && <QTag icon={<Banknote size={14} color={C.green} strokeWidth={2} />} label="Asking" value={`$${Number(lead.askingPrice).toLocaleString()}`} bg={C.greenS} />}
        {lead.arv && <QTag icon={<HomeDot color={C.purple} />} label="ARV" value={`$${Number(lead.arv).toLocaleString()}`} bg={C.purpleS} />}
        {lead.estimatedRepairs && Number(lead.estimatedRepairs) > 0 && <QTag icon={<Wrench size={14} color={C.orange} strokeWidth={2} />} label="Repairs" value={`$${Number(lead.estimatedRepairs).toLocaleString()}`} bg={C.orangeS} />}
        {lead.beds > 0 && <QTag icon={<HomeDot color={C.teal} />} label="Beds/Baths" value={`${lead.beds}bd/${lead.baths}ba`} bg={C.tealS} />}
        {lead.condition && <QTag icon={<Thermometer size={14} color={C.pink} strokeWidth={2} />} label="Condition" value={lead.condition} bg={C.pinkS} />}
      </div>

      {lead.keyPainPoints && (
        <div className="neo-pressed-sm" style={{ marginTop: 12, padding: 12 }}>
          <p style={{ fontSize: 12, color: C.red, fontWeight: 700, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Motivation</p>
          <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{lead.keyPainPoints}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="maya-tile press-sm" aria-label={`Call ${lead.sellerName}`} style={{ flex: 1, height: 48, borderRadius: 14, background: C.teal, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', textDecoration: 'none', boxShadow: `0 4px 16px ${C.teal}30` }}>
          <PhoneCall size={16} strokeWidth={2.5} /> Call Now
        </a>
        <button onClick={callWithMaya} disabled={calling} className="maya-tile press-sm" aria-label={`Call ${lead.sellerName} with Maya`} style={{ flex: 1.3, height: 48, borderRadius: 14, background: calling ? C.orange : `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: 0, opacity: calling ? 0.7 : 1 }}>
          {calling ? <><Sparkles size={16} className="pulse-glow" /> Calling…</> : <><Bot size={16} strokeWidth={2} /> Call with Maya</>}
        </button>
        <button onClick={onDelete} className="neo-pressed-sm press-sm" aria-label={`Delete ${lead.sellerName}`} style={{ width: 48, height: 48, borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/></svg>
        </button>
      </div>

      {callResult && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: callResult.ok ? C.greenS : C.redS, color: callResult.ok ? C.green : C.red, lineHeight: 1.5 }}>
          {callResult.msg}
        </div>
      )}
    </NeoTile>
  );
}

function AddLeadSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (lead: Lead) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [mot, setMot] = useState<'hot' | 'warm' | 'cold'>('hot');

  const save = () => {
    if (!name.trim() || !phone.trim()) return;
    onAdd({ id: getNextId(), sellerName: name.trim(), propertyAddress: address.trim() || 'Address not provided', phone: phone.trim(), email: null, motivationLevel: mot, timeline: 'Unknown', askingPrice: '', arv: '', estimatedRepairs: '', beds: 0, baths: 0, condition: '', keyPainPoints: '' });
  };

  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.3)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div className="neo-sheet" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: 28, borderRadius: '28px 28px 0 0' }}>
      <div style={{ width: 40, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 24px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 20px' }}>Add Lead</h2>
      {[
        { label: 'Name *', val: name, set: setName, ph: 'e.g., Jane Smith' },
        { label: 'Phone *', val: phone, set: setPhone, ph: '(413) 555-0000' },
        { label: 'Property Address', val: address, set: setAddress, ph: '123 Main St, Springfield, MA' },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, display: 'block' }}>{f.label}</label>
          <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} className="neo-input" style={{ height: 48 }} />
        </div>
      ))}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, display: 'block' }}>Motivation</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['hot', 'warm', 'cold'] as const).map(m => (
            <button key={m} onClick={() => setMot(m)} className={`${m === 'hot' ? 'maya-tag-hot' : m === 'warm' ? 'maya-tag-warm' : 'maya-tag-cold'} press-sm`} style={{ flex: 1, padding: '10px 0', borderRadius: 14, fontSize: 14, fontWeight: 700, textTransform: 'capitalize', border: 'none', cursor: 'pointer', opacity: mot === m ? 1 : 0.4 }}>
              {m === 'hot' && '🔥'}{m}
            </button>
          ))}
        </div>
      </div>
      <button onClick={save} disabled={!name.trim() || !phone.trim()} className="maya-tile press-sm" style={{ width: '100%', height: 52, borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: 0, opacity: name.trim() && phone.trim() ? 1 : 0.45 }}>
        Save Lead
      </button>
      <button onClick={onClose} style={{ width: '100%', marginTop: 10, height: 44, background: 'transparent', color: C.muted, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', borderRadius: 16 }}>Cancel</button>
    </div>
  </>;
}
