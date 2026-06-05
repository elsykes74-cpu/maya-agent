import { useState, useEffect, useRef } from 'react';
import { Search, Plus, PhoneCall, MapPin, Clock, Banknote, Wrench, Thermometer, Bot, Sparkles, ChevronRight, Mail, Edit3, Check, X, Send, ExternalLink } from 'lucide-react';
import { C, NeoTile, NeoIcon, MotTag, QTag, HomeDot, ConfirmSheet, BackBtn } from '@/components/Neo';
import { loadLeads, saveLeads, addCallRecord, getNextId, getLeadCallLogs, OUTCOME_LABELS, OUTCOME_TO_CAMPAIGN, addAuditEntry, getSkyslopeTransactionId, setSkyslopeTransactionId, addLeadCallLog, assignLeadToCampaign } from '@/lib/persistence';
import type { Lead, LeadCallLog, CallOutcome } from '@/lib/persistence';
import { pushLead, pushLeadDelete } from '@/lib/sync';
import { trpc } from '@/providers/trpc';

export default function Leads() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
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
      onConfirm: () => {
        setLeads(p => p.filter(l => l.id !== id));
        pushLeadDelete(id);
        addAuditEntry({ action: 'lead_deleted', entityId: id, entityName: lead.sellerName, detail: lead.propertyAddress });
        setSelectedLead(null);
        setConfirmOpen(false);
      },
    });
    setConfirmOpen(true);
  };

  const updateLead = (updated: Lead) => {
    setLeads(p => p.map(l => l.id === updated.id ? updated : l));
    setSelectedLead(updated);
    pushLead(updated);
    addAuditEntry({ action: 'lead_updated', entityId: updated.id, entityName: updated.sellerName, detail: updated.motivationLevel });
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
        <LeadCard key={l.id} lead={l}
          onOpen={() => setSelectedLead(l)}
          onDelete={() => deleteLead(l.id)}
          onCallRecord={(rec) => { addCallRecord(rec); }} />
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

      {showAdd && <AddLeadSheet onClose={() => setShowAdd(false)} onAdd={(lead) => { setLeads(p => [lead, ...p]); pushLead(lead); addAuditEntry({ action: 'lead_added', entityId: lead.id, entityName: lead.sellerName, detail: lead.motivationLevel }); setShowAdd(false); }} />}

      {selectedLead && (
        <LeadDetailSheet
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onDelete={() => deleteLead(selectedLead.id)}
          onUpdate={updateLead}
          onCallRecord={(rec) => { addCallRecord(rec); }}
        />
      )}

      {confirmData && <ConfirmSheet open={confirmOpen} title={confirmData.title} desc={confirmData.desc} danger onConfirm={confirmData.onConfirm} onCancel={() => setConfirmOpen(false)} />}
    </div>
  );
}

function LeadCard({ lead, onOpen, onDelete, onCallRecord }: { lead: Lead; onOpen: () => void; onDelete: () => void; onCallRecord: (r: any) => void }) {
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [liveSid, setLiveSid] = useState<string | null>(null);

  const callWithMaya = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCalling(true);
    setCallError(null);
    setLiveSid(null);
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
        setLiveSid(sid);
      } else {
        throw new Error(data?.error?.message || 'Call failed');
      }
    } catch (e: any) {
      setCallError(e.message || 'Call failed — check Twilio settings');
    }
    setCalling(false);
  };

  return (
    <NeoTile style={{ marginBottom: 12, cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{lead.sellerName}</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
            <MapPin size={12} strokeWidth={2} /> {lead.propertyAddress}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MotTag level={lead.motivationLevel} />
          <ChevronRight size={16} color={C.tertiary ?? C.muted} strokeWidth={2} />
        </div>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
        <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="maya-tile press-sm" aria-label={`Call ${lead.sellerName}`} style={{ flex: 1, height: 48, borderRadius: 14, background: C.teal, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', textDecoration: 'none', boxShadow: `0 4px 16px ${C.teal}30` }}>
          <PhoneCall size={16} strokeWidth={2.5} /> Call Now
        </a>
        <button onClick={callWithMaya} disabled={calling} className="maya-tile press-sm" aria-label={`Call ${lead.sellerName} with Maya`} style={{ flex: 1.3, height: 48, borderRadius: 14, background: calling ? C.orange : `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: 0, opacity: calling ? 0.7 : 1 }}>
          {calling ? <><Sparkles size={16} className="pulse-glow" /> Calling…</> : <><Bot size={16} strokeWidth={2} /> Call with Maya</>}
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} className="neo-pressed-sm press-sm" aria-label={`Delete ${lead.sellerName}`} style={{ width: 48, height: 48, borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/></svg>
        </button>
      </div>

      {callError && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: C.redS, color: C.red, lineHeight: 1.5 }}>
          {callError}
        </div>
      )}
      {liveSid && (
        <div onClick={e => e.stopPropagation()}>
          <LiveCallMonitor
            sid={liveSid}
            leadId={lead.id}
            leadName={lead.sellerName}
            phone={lead.phone}
            motivationLevel={lead.motivationLevel}
            onDone={(rec) => { onCallRecord(rec); setLiveSid(null); }}
            onCancel={() => setLiveSid(null)}
          />
        </div>
      )}
    </NeoTile>
  );
}

function LeadDetailSheet({ lead, onClose, onDelete, onUpdate, onCallRecord }: {
  lead: Lead;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (l: Lead) => void;
  onCallRecord: (r: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Lead>({ ...lead });
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [liveSid, setLiveSid] = useState<string | null>(null);
  const [smsBody, setSmsBody] = useState('');
  const [showSms, setShowSms] = useState(false);
  const [callLogs, setCallLogs] = useState<LeadCallLog[]>([]);

  useEffect(() => { setCallLogs(getLeadCallLogs(lead.id)); }, [lead.id]);

  const sendSmsMutation = trpc.sms.sendOne.useMutation();

  const mao = lead.arv && lead.estimatedRepairs
    ? Math.round(Number(lead.arv) * 0.70 - Number(lead.estimatedRepairs))
    : lead.arv
    ? Math.round(Number(lead.arv) * 0.70)
    : null;

  const saveEdit = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const callWithMaya = async () => {
    setCalling(true);
    setCallError(null);
    setLiveSid(null);
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
        setLiveSid(sid);
      } else {
        throw new Error(data?.error?.message || 'Call failed');
      }
    } catch (e: any) {
      setCallError(e.message || 'Call failed — check Twilio settings');
    }
    setCalling(false);
  };

  const sendSms = async () => {
    if (!smsBody.trim()) return;
    try {
      await sendSmsMutation.mutateAsync({ to: lead.phone, body: smsBody.trim(), leadId: lead.id });
      setSmsBody('');
      setShowSms(false);
    } catch {}
  };

  const F = ({ label, value, field, multiline }: { label: string; value: string; field: keyof Lead; multiline?: boolean }) => (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{label}</p>
      {editing ? (
        multiline
          ? <textarea value={String(draft[field] ?? '')} onChange={e => setDraft(p => ({ ...p, [field]: e.target.value }))} rows={3} style={inputSt} />
          : <input value={String(draft[field] ?? '')} onChange={e => setDraft(p => ({ ...p, [field]: e.target.value }))} style={inputSt} />
      ) : (
        <p style={{ fontSize: 15, fontWeight: 600, color: value ? C.text : C.tertiary ?? C.muted, margin: 0 }}>{value || '—'}</p>
      )}
    </div>
  );

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: C.bg ?? '#111' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', position: 'sticky', top: 0, background: C.bg ?? '#111', zIndex: 1 }}>
          <BackBtn onClick={onClose} />
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Lead Details</span>
          <button
            onClick={() => editing ? saveEdit() : setEditing(true)}
            style={{ background: editing ? C.teal : C.surface, border: 'none', borderRadius: 12, padding: '8px 14px', fontSize: 14, fontWeight: 700, color: editing ? '#fff' : C.teal, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {editing ? <><Check size={14} /> Save</> : <><Edit3 size={14} /> Edit</>}
          </button>
        </div>

        <div style={{ padding: '0 20px 100px' }}>
          {/* Hero */}
          <NeoTile style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                {editing
                  ? <input value={draft.sellerName} onChange={e => setDraft(p => ({ ...p, sellerName: e.target.value }))} style={{ ...inputSt, fontSize: 22, fontWeight: 800 }} />
                  : <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{lead.sellerName}</p>
                }
                <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <MapPin size={12} strokeWidth={2} />
                  {editing
                    ? <input value={draft.propertyAddress} onChange={e => setDraft(p => ({ ...p, propertyAddress: e.target.value }))} style={{ ...inputSt, fontSize: 13 }} />
                    : lead.propertyAddress
                  }
                </p>
              </div>
              {editing ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['hot', 'warm', 'cold'] as const).map(m => (
                    <button key={m} onClick={() => setDraft(p => ({ ...p, motivationLevel: m }))}
                      style={{ padding: '6px 10px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: draft.motivationLevel === m ? 1 : 0.35, background: m === 'hot' ? C.redS : m === 'warm' ? C.orangeS : C.blueS, color: m === 'hot' ? C.red : m === 'warm' ? C.orange : C.blue }}>
                      {m === 'hot' ? '🔥' : m === 'warm' ? '♨️' : '❄️'} {m}
                    </button>
                  ))}
                </div>
              ) : (
                <MotTag level={lead.motivationLevel} />
              )}
            </div>

            {/* Contact */}
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`tel:${lead.phone.replace(/\D/g, '')}`} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: C.tealS, color: C.teal, border: 'none', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                <PhoneCall size={14} strokeWidth={2} /> {lead.phone}
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: C.blueS, color: C.blue, border: 'none', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                  <Mail size={14} strokeWidth={2} /> Email
                </a>
              )}
            </div>
          </NeoTile>

          {/* MAO Calculator */}
          {mao !== null && (
            <NeoTile style={{ marginBottom: 16, background: `linear-gradient(135deg, ${C.purple}22, ${C.teal}11)` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>MAO Calculator (70% Rule)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: '0 0 2px' }}>ARV</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.purple, margin: 0 }}>${Number(lead.arv).toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: '0 0 2px' }}>Repairs</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.orange, margin: 0 }}>${Number(lead.estimatedRepairs || 0).toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: '0 0 2px' }}>MAO</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.teal, margin: 0 }}>${mao.toLocaleString()}</p>
                </div>
              </div>
            </NeoTile>
          )}

          {/* Property Details */}
          <p className="maya-section-title">Property</p>
          <NeoTile style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              <F label="Beds" value={lead.beds > 0 ? String(lead.beds) : ''} field="beds" />
              <F label="Baths" value={lead.baths > 0 ? String(lead.baths) : ''} field="baths" />
              <F label="Condition" value={lead.condition} field="condition" />
              <F label="Timeline" value={lead.timeline} field="timeline" />
            </div>
          </NeoTile>

          {/* Financials */}
          <p className="maya-section-title">Financials</p>
          <NeoTile style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              <F label="Asking Price" value={lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : ''} field="askingPrice" />
              <F label="ARV" value={lead.arv ? `$${Number(lead.arv).toLocaleString()}` : ''} field="arv" />
              <F label="Est. Repairs" value={lead.estimatedRepairs ? `$${Number(lead.estimatedRepairs).toLocaleString()}` : ''} field="estimatedRepairs" />
            </div>
          </NeoTile>

          {/* Motivation / Pain Points */}
          <p className="maya-section-title">Seller Notes</p>
          <NeoTile style={{ marginBottom: 16 }}>
            <F label="Key Pain Points / Motivation" value={lead.keyPainPoints} field="keyPainPoints" multiline />
          </NeoTile>

          {/* SkySlope */}
          <SkySlopeSection lead={lead} />

          {/* Call Log */}
          {callLogs.length > 0 && (
            <>
              <p className="maya-section-title">Call History</p>
              <NeoTile style={{ marginBottom: 16 }}>
                {callLogs.map((log, i) => {
                  const outcomeColor = log.outcome === 'connected_interested' || log.outcome === 'callback_requested' ? C.green
                    : log.outcome === 'voicemail' ? C.orange
                    : log.outcome === 'connected_not_interested' || log.outcome === 'hung_up' ? C.red
                    : C.muted;
                  const fmt = (s: number) => s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
                  return (
                    <div key={log.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < callLogs.length - 1 ? '1px solid rgba(128,128,128,0.1)' : 'none' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: outcomeColor, marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: outcomeColor }}>{OUTCOME_LABELS[log.outcome]}</span>
                          <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                            {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {fmt(log.duration) ? ` · ${fmt(log.duration)}` : ''}
                          </span>
                        </div>
                        {log.campaignAssigned && (
                          <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', fontWeight: 600 }}>→ {log.campaignAssigned}</p>
                        )}
                        {log.notes && <p style={{ fontSize: 13, color: C.text, margin: '4px 0 0', lineHeight: 1.5, fontWeight: 500 }}>{log.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </NeoTile>
            </>
          )}

          {/* SMS */}
          {showSms && (
            <NeoTile style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Send SMS to {lead.sellerName}</p>
              <textarea value={smsBody} onChange={e => setSmsBody(e.target.value)} placeholder="Type your message…" rows={3} style={{ ...inputSt, resize: 'none', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={sendSms} disabled={!smsBody.trim() || sendSmsMutation.isPending} style={{ flex: 1, height: 42, borderRadius: 12, background: C.teal, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Send size={14} /> {sendSmsMutation.isPending ? 'Sending…' : 'Send'}
                </button>
                <button onClick={() => setShowSms(false)} style={{ width: 42, height: 42, borderRadius: 12, background: C.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} color={C.muted} />
                </button>
              </div>
            </NeoTile>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={callWithMaya} disabled={calling} style={{ height: 52, borderRadius: 16, background: calling ? C.orange : `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', opacity: calling ? 0.7 : 1 }}>
              {calling ? <><Sparkles size={18} className="pulse-glow" /> Calling…</> : <><Bot size={18} strokeWidth={2} /> Call with Maya</>}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href={`tel:${lead.phone.replace(/\D/g, '')}`} style={{ flex: 1, height: 48, borderRadius: 14, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <PhoneCall size={16} strokeWidth={2.5} /> Call Now
              </a>
              <button onClick={() => setShowSms(s => !s)} style={{ flex: 1, height: 48, borderRadius: 14, background: C.blueS, color: C.blue, border: 'none', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                <Send size={15} strokeWidth={2} /> Send SMS
              </button>
            </div>
            {callError && (
              <div style={{ padding: '12px 16px', borderRadius: 14, background: C.redS, color: C.red, fontSize: 13, fontWeight: 600 }}>
                {callError}
              </div>
            )}
            {liveSid && (
              <LiveCallMonitor
                sid={liveSid}
                leadId={lead.id}
                leadName={lead.sellerName}
                phone={lead.phone}
                motivationLevel={lead.motivationLevel}
                onDone={(rec) => { onCallRecord(rec); setLiveSid(null); }}
                onCancel={() => setLiveSid(null)}
              />
            )}
            <button onClick={onDelete} style={{ height: 48, borderRadius: 14, background: C.redS, color: C.red, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Delete Lead
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputSt: React.CSSProperties = {
  width: '100%', border: `1px solid rgba(128,128,128,0.2)`, borderRadius: 10,
  padding: '8px 10px', fontSize: 15, background: 'rgba(128,128,128,0.08)',
  color: 'inherit', fontWeight: 600, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};

const LIVE_OUTCOMES: { outcome: CallOutcome; label: string; color: string; bg: string }[] = [
  { outcome: 'voicemail',                label: 'Voicemail',          color: C.orange, bg: C.orangeS },
  { outcome: 'connected_interested',     label: 'Interested',         color: C.green,  bg: C.greenS },
  { outcome: 'connected_not_interested', label: 'Not Interested',     color: C.muted,  bg: 'rgba(128,128,128,0.1)' },
  { outcome: 'callback_requested',       label: 'Callback Requested', color: C.teal,   bg: C.tealS },
  { outcome: 'no_answer',                label: 'No Answer',          color: C.blue,   bg: C.blueS },
  { outcome: 'hung_up',                  label: 'Hung Up',            color: C.red,    bg: C.redS },
];

const OUTCOME_TO_SIMPLE: Record<CallOutcome, 'connected' | 'voicemail' | 'no_answer'> = {
  voicemail:                'voicemail',
  connected_interested:     'connected',
  connected_not_interested: 'connected',
  callback_requested:       'connected',
  no_answer:                'no_answer',
  hung_up:                  'no_answer',
};

function LiveCallMonitor({ sid, leadId, leadName, phone, motivationLevel, onDone, onCancel }: {
  sid: string; leadId: number; leadName: string; phone: string; motivationLevel: string;
  onDone: (rec: any) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [timer, setTimer] = useState(0);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<CallOutcome | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTimer = useRef(0);

  const { data: statusData } = trpc.maya.getTranscript.useQuery(
    { sid },
    { enabled: phase !== 'ended', refetchInterval: phase !== 'ended' ? 3000 : false }
  );
  const { data: convData } = trpc.maya.getConversation.useQuery(
    { callSid: sid },
    { enabled: phase === 'ended', refetchInterval: 4000, staleTime: 0 }
  );
  const { data: analysis, isLoading: analyzing } = trpc.maya.analyzeOutcome.useQuery(
    { callSid: sid, duration: finalTimer.current },
    { enabled: phase === 'ended', staleTime: 60_000, retry: 2 }
  );

  useEffect(() => {
    if (!statusData?.status) return;
    const s = statusData.status;
    if (s === 'in-progress' && phase === 'ringing') {
      setPhase('connected');
      timerRef.current = setInterval(() => {
        setTimer(t => { finalTimer.current = t + 1; return t + 1; });
      }, 1000);
    }
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(s) && phase !== 'ended') {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('ended');
    }
  }, [statusData?.status]);

  // Pre-select Maya's detected outcome and fill notes
  useEffect(() => {
    if (analysis?.outcome && !selected) {
      setSelected(analysis.outcome as CallOutcome);
      setNotes(analysis.notes ?? '');
    }
  }, [analysis]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const save = (outcome: CallOutcome) => {
    const turns = convData?.turns ?? [];
    const transcriptText = turns.length > 0
      ? turns.map(t => `${t.role === 'assistant' ? 'Maya' : 'Seller'}: ${t.content}`).join('\n')
      : null;
    const rec = {
      id: Date.now(),
      leadId,
      leadName,
      phone,
      outcome: OUTCOME_TO_SIMPLE[outcome],
      duration: finalTimer.current,
      transcript: transcriptText,
      notes: notes.trim() || null,
      createdAt: new Date().toISOString(),
      callSid: sid,
    };
    addLeadCallLog({
      leadId, leadName, phone, outcome,
      notes: notes.trim() || '',
      duration: finalTimer.current,
      campaignAssigned: OUTCOME_TO_CAMPAIGN[outcome],
      createdAt: rec.createdAt,
    });
    assignLeadToCampaign({ leadId, leadName, phone, motivationLevel }, OUTCOME_TO_CAMPAIGN[outcome]);
    addAuditEntry({ action: 'call_logged', entityId: leadId, entityName: leadName, detail: `${OUTCOME_LABELS[outcome]} · ${finalTimer.current}s → ${OUTCOME_TO_CAMPAIGN[outcome]}` });
    onDone(rec);
  };

  if (phase === 'ended') {
    return (
      <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>
              Call ended {finalTimer.current > 0 ? `· ${fmt(finalTimer.current)}` : ''}
            </p>
            {analyzing ? (
              <p style={{ fontSize: 11, color: C.purple, margin: '2px 0 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={10} strokeWidth={2} /> Maya is analyzing the call…
              </p>
            ) : analysis ? (
              <p style={{ fontSize: 11, color: C.purple, margin: '2px 0 0', fontWeight: 600 }}>
                Maya detected: {OUTCOME_LABELS[analysis.outcome as CallOutcome]} · tap to confirm or change
              </p>
            ) : (
              <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>What happened?</p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {LIVE_OUTCOMES.map(({ outcome, label, color, bg }) => {
            const isSelected = selected === outcome;
            return (
              <button key={outcome} onClick={() => { setSelected(outcome); save(outcome); }}
                style={{ padding: '10px 8px', borderRadius: 12, border: `2px solid ${isSelected ? color : color + '30'}`, background: isSelected ? color + '25' : bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer', position: 'relative' }}>
                {isSelected && <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 10 }}>✓</span>}
                {label}
              </button>
            );
          })}
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…" rows={2}
          style={{ width: '100%', border: '1px solid rgba(128,128,128,0.2)', borderRadius: 10, padding: '8px 10px', fontSize: 13, background: 'rgba(128,128,128,0.06)', color: 'inherit', fontWeight: 500, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'none', marginBottom: 8 }} />

        {convData?.turns && convData.turns.length > 0 && (
          <details style={{ marginBottom: 8 }}>
            <summary style={{ fontSize: 12, fontWeight: 700, color: C.teal, cursor: 'pointer', userSelect: 'none' }}>
              View transcript ({convData.turns.length} turns)
            </summary>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }} className="hide-scrollbar">
              {convData.turns.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: t.role === 'assistant' ? 'flex-start' : 'flex-end' }}>
                  <div style={{ maxWidth: '85%', padding: '7px 10px', borderRadius: t.role === 'assistant' ? '12px 12px 12px 3px' : '12px 12px 3px 12px', background: t.role === 'assistant' ? C.purpleS : C.tealS, fontSize: 12, color: t.role === 'assistant' ? C.purple : C.teal, lineHeight: 1.5, fontWeight: 500 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, display: 'block', marginBottom: 2 }}>{t.role === 'assistant' ? 'Maya' : 'Seller'}</span>
                    {t.content}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        <button onClick={onCancel} style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: 600 }}>Skip logging</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16, background: phase === 'connected' ? `${C.green}12` : `${C.orange}12`, border: `1px solid ${phase === 'connected' ? C.green : C.orange}30`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: phase === 'connected' ? C.green : C.orange, flexShrink: 0, animation: 'mayaPulse 2.5s ease-in-out infinite' }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: phase === 'connected' ? C.green : C.orange, margin: 0 }}>
          {phase === 'connected' ? `Connected · ${fmt(timer)}` : 'Ringing…'}
        </p>
        <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{leadName}</p>
      </div>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
        <X size={14} />
      </button>
    </div>
  );
}

function SkySlopeSection({ lead }: { lead: Lead }) {
  const [saleGuid, setSaleGuid] = useState<string | null>(() => getSkyslopeTransactionId(lead.id));
  const configQuery = trpc.skyslope.configStatus.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const createMut = trpc.skyslope.createTransaction.useMutation({
    onSuccess: (data) => {
      if (data.saleGuid) {
        setSkyslopeTransactionId(lead.id, data.saleGuid);
        setSaleGuid(data.saleGuid);
      }
    },
  });

  const isConfigured = configQuery.data?.fullyConfigured;

  return (
    <>
      <p className="maya-section-title">SkySlope</p>
      <NeoTile style={{ marginBottom: 16 }}>
        {configQuery.isLoading ? (
          <p style={{ fontSize: 14, color: C.muted, margin: 0, fontWeight: 500 }}>Checking SkySlope…</p>
        ) : !isConfigured ? (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Setup required</p>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
              Contact your SkySlope Customer Success Manager for your Client ID &amp; Secret, then add{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_ACCESS_SECRET</span>,{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_CLIENT_ID</span>,{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_CLIENT_SECRET</span>,{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_OFFICE_GUID</span>,{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_AGENT_GUID</span>, and{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>SKYSLOPE_CHECKLIST_TYPE_ID</span>{' '}
              to Vercel environment variables.
            </p>
          </div>
        ) : saleGuid ? (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Transaction linked</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Check size={14} color={C.green} strokeWidth={2.5} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>Sent to SkySlope</span>
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.5 }}>
              {saleGuid}
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: '0 0 12px', lineHeight: 1.4 }}>
              Create a transaction for {lead.propertyAddress}
            </p>
            <button
              onClick={() => createMut.mutate({
                sellerName: lead.sellerName,
                propertyAddress: lead.propertyAddress,
                salePrice: lead.askingPrice ? Number(lead.askingPrice) : undefined,
              })}
              disabled={createMut.isPending}
              style={{ width: '100%', height: 44, borderRadius: 12, background: C.teal, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: createMut.isPending ? 0.7 : 1 }}
            >
              <ExternalLink size={14} strokeWidth={2} />
              {createMut.isPending ? 'Creating…' : 'Create Transaction'}
            </button>
            {createMut.isError && (
              <p style={{ fontSize: 12, color: C.red, margin: '8px 0 0', lineHeight: 1.5, fontWeight: 500 }}>
                {(createMut.error as Error).message}
              </p>
            )}
          </div>
        )}
      </NeoTile>
    </>
  );
}

function AddLeadSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (lead: Lead) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [mot, setMot] = useState<'hot' | 'warm' | 'cold'>('hot');

  const save = () => {
    if (!name.trim() || !phone.trim()) return;
    onAdd({ id: getNextId(), sellerName: name.trim(), propertyAddress: address.trim() || 'Address not provided', phone: phone.trim(), email: email.trim() || null, motivationLevel: mot, timeline: 'Unknown', askingPrice: '', arv: '', estimatedRepairs: '', beds: 0, baths: 0, condition: '', keyPainPoints: '' });
  };

  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.3)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div className="neo-sheet" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: 28, borderRadius: '28px 28px 0 0' }}>
      <div style={{ width: 40, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 24px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 20px' }}>Add Lead</h2>
      {[
        { label: 'Name *', val: name, set: setName, ph: 'e.g., Jane Smith', type: 'text' },
        { label: 'Phone *', val: phone, set: setPhone, ph: '(413) 555-0000', type: 'tel' },
        { label: 'Email', val: email, set: setEmail, ph: 'seller@email.com', type: 'email' },
        { label: 'Property Address', val: address, set: setAddress, ph: '123 Main St, Springfield, MA', type: 'text' },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, display: 'block' }}>{f.label}</label>
          <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type} className="neo-input" style={{ height: 48 }} />
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
