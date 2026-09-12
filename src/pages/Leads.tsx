import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search, Plus, Phone, PhoneCall, MapPin, Bot, Sparkles, RefreshCw } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { C, NeoTile, NeoIcon, MotTag } from '@/components/Neo';
import { trpc } from '@/providers/trpc';
import type { AppRouter } from '../../api/router';

type RouterOutput = inferRouterOutputs<AppRouter>;
type LeadItem = RouterOutput['leads']['list']['items'][number];

const PAGE_SIZE = 60;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function fmtMoney(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return '$' + Math.round(n).toLocaleString('en-US');
}

const LEAD_TYPE_LABELS: Record<string, string> = {
  vacant: 'Vacant property',
  absentee_owner: 'Absentee owner',
  probate: 'Probate',
  tax_delinquent: 'Tax delinquent',
  pre_foreclosure: 'Pre-foreclosure',
  tired_landlord: 'Tired landlord',
  code_violation: 'Code violation',
  expired_listing: 'Expired listing',
  fsbo: 'FSBO',
  high_equity: 'High equity',
  inherited: 'Inherited',
  fire_damaged: 'Fire damaged',
  long_term_owner: 'Long-term owner',
};

const CONDITION_LABELS: Record<string, string> = {
  light_rehab: 'Light rehab',
  medium_rehab: 'Medium rehab',
  heavy_rehab: 'Heavy rehab',
  move_in_ready: 'Move-in ready',
};

/** Short, human-readable signal chips — never a raw data dump. */
function signalChips(lead: LeadItem): string[] {
  const chips: string[] = [];
  const equity = fmtMoney(lead.estimatedEquity);
  if (equity) chips.push(`Equity ≈ ${equity}`);
  if (lead.isVacant) chips.push('Vacant');
  if (lead.isAbsentee) chips.push('Absentee owner');
  if (lead.isFsbo) chips.push('FSBO');
  const typeLabel = lead.leadType ? LEAD_TYPE_LABELS[lead.leadType] : null;
  if (typeLabel && typeLabel !== 'FSBO') chips.push(typeLabel);
  return chips.slice(0, 3);
}

export default function Leads() {
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showAdd, setShowAdd] = useState(false);
  const debouncedSearch = useDebounced(search.trim(), 400);

  useEffect(() => { setLimit(PAGE_SIZE); }, [filter, debouncedSearch]);

  const statsQ = trpc.leads.stats.useQuery();
  const listQ = trpc.leads.list.useQuery({
    motivation: filter === 'all' ? undefined : filter,
    search: debouncedSearch || undefined,
    limit,
    offset: 0,
  });

  const utils = trpc.useUtils();
  const refresh = () => {
    listQ.refetch();
    statsQ.refetch();
  };

  const stats = statsQ.data;
  const tabs = [
    { k: 'all' as const, l: 'All', n: stats?.total ?? 0 },
    { k: 'hot' as const, l: '🔥 Hot', n: stats?.hot ?? 0 },
    { k: 'warm' as const, l: 'Warm', n: stats?.warm ?? 0 },
    { k: 'cold' as const, l: 'Cold', n: stats?.cold ?? 0 },
  ];

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Leads</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={refresh} className="press-sm" aria-label="Refresh leads" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <NeoIcon bg={C.bg} size={48}><RefreshCw size={20} color={C.muted} strokeWidth={2.5} /></NeoIcon>
          </button>
          <button onClick={() => setShowAdd(true)} className="press-sm" aria-label="Add new lead" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <NeoIcon bg={C.tealS} size={48}><Plus size={22} color={C.teal} strokeWidth={2.5} /></NeoIcon>
          </button>
        </div>
      </div>

      <div className="neo-search" style={{ marginBottom: 16 }}>
        <Search size={18} color={C.muted} strokeWidth={2} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, address, or phone…"
          aria-label="Search leads"
        />
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

      {listQ.isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="neo-raised-sm" style={{ height: 120, borderRadius: 20 }} />)}
        </div>
      )}

      {listQ.isError && (
        <NeoTile style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>Couldn't load leads</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>Check your connection and try again.</p>
          <button onClick={refresh} className="maya-tile press-sm" style={{ padding: '12px 24px', borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Retry
          </button>
        </NeoTile>
      )}

      {listQ.isSuccess && items.map(l => (
        <LeadCard key={l.id} lead={l} />
      ))}

      {listQ.isSuccess && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <NeoIcon bg={C.tealS} size={64} round={20} style={{ margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Search size={28} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No leads found</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 16px' }}>
            {debouncedSearch || filter !== 'all' ? 'Try adjusting filters or search' : 'New leads from scans will appear here'}
          </p>
          <button onClick={() => setShowAdd(true)} className="maya-tile press-sm" style={{ padding: '12px 24px', borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} strokeWidth={2.5} /> Add Lead
          </button>
        </div>
      )}

      {listQ.isSuccess && items.length > 0 && items.length < total && (
        <button
          onClick={() => setLimit(v => v + PAGE_SIZE)}
          className="neo-raised-sm press-sm"
          style={{ width: '100%', padding: '14px', borderRadius: 16, border: 'none', fontSize: 15, fontWeight: 700, color: C.teal, cursor: 'pointer', marginTop: 4 }}
        >
          Show more ({items.length} of {total})
        </button>
      )}

      <div style={{ height: 20 }} />

      {showAdd && (
        <AddLeadSheet
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            utils.leads.list.invalidate();
            utils.leads.stats.invalidate();
          }}
        />
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: LeadItem }) {
  const navigate = useNavigate();
  const [callResult, setCallResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const placeCall = trpc.maya.placeCall.useMutation({
    onSuccess: (data: any) => {
      const sid = data?.sid ?? data?.result?.sid;
      setCallResult({ ok: true, msg: sid ? 'Call placed — Maya is dialing now.' : 'Call placed.' });
    },
    onError: (e: any) => {
      setCallResult({ ok: false, msg: e.message || 'Call failed — check voice settings' });
    },
  });

  const digits = (lead.phone ?? '').replace(/\D/g, '');
  const hasPhone = digits.length >= 7;

  const asking = fmtMoney(lead.askingPrice);
  const arv = fmtMoney(lead.arv);
  const beds = lead.beds && Number(lead.beds) > 0 ? `${lead.beds}bd` : null;
  const baths = lead.baths && Number(lead.baths) > 0 ? `${Number(lead.baths)}ba` : null;
  const bedBath = [beds, baths].filter(Boolean).join('/');
  const condition = lead.condition ? CONDITION_LABELS[lead.condition] ?? null : null;
  const facts = [
    asking ? `${asking} asking` : null,
    arv ? `ARV ${arv}` : null,
    bedBath || null,
    condition,
  ].filter(Boolean);

  const chips = signalChips(lead);

  const callWithMaya = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (placeCall.isPending || !hasPhone) return;
    setCallResult(null);
    placeCall.mutate({ to: digits, name: lead.sellerName ?? '', address: lead.propertyAddress ?? '' });
  };

  return (
    <NeoTile style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => navigate(`/leads/${lead.id}`)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.sellerName || 'Unknown seller'}
          </p>
          <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <MapPin size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.propertyAddress}</span>
          </p>
        </div>
        <MotTag level={lead.motivationLevel ?? 'cold'} />
      </div>

      {facts.length > 0 && (
        <p style={{ fontSize: 14, color: C.text, fontWeight: 600, margin: '10px 0 0' }}>
          {facts.join('  ·  ')}
        </p>
      )}

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {chips.map(c => (
            <span key={c} style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: C.tealS, padding: '5px 10px', borderRadius: 10 }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {lead.keyPainPoints && chips.length === 0 && (
        <p style={{ fontSize: 13, color: C.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
          {lead.keyPainPoints.length > 110 ? lead.keyPainPoints.slice(0, 110) + '…' : lead.keyPainPoints}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
        {hasPhone ? (
          <>
            <button
              onClick={callWithMaya}
              disabled={placeCall.isPending}
              className="maya-tile press-sm"
              aria-label={`Call ${lead.sellerName} with Maya`}
              style={{ flex: 1, height: 48, borderRadius: 14, background: placeCall.isPending ? C.orange : `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: 0, opacity: placeCall.isPending ? 0.7 : 1 }}
            >
              {placeCall.isPending
                ? <><Sparkles size={16} className="pulse-glow" /> Calling…</>
                : <><Bot size={16} strokeWidth={2} /> Call with Maya</>}
            </button>
            <a
              href={`tel:${digits}`}
              className="neo-pressed-sm press-sm"
              aria-label={`Dial ${lead.sellerName} yourself`}
              style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              <PhoneCall size={16} color={C.teal} strokeWidth={2} />
            </a>
          </>
        ) : (
          <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={14} strokeWidth={2} /> No phone yet — skip trace pending
          </p>
        )}
      </div>

      {callResult && (
        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: callResult.ok ? C.greenS : C.redS, color: callResult.ok ? C.green : C.red, lineHeight: 1.5 }}>
          {callResult.msg}
        </div>
      )}
    </NeoTile>
  );
}

function AddLeadSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [mot, setMot] = useState<'hot' | 'warm' | 'cold'>('hot');
  const [err, setErr] = useState<string | null>(null);

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => onAdded(),
    onError: (e: any) => setErr(e.message ?? 'Failed to save lead'),
  });

  const save = () => {
    if (createLead.isPending) return;
    if (!name.trim() || !address.trim()) return;
    setErr(null);
    createLead.mutate({
      sellerName: name.trim(),
      propertyAddress: address.trim(),
      phone: phone.trim() || undefined,
      motivationLevel: mot,
    });
  };

  const busy = createLead.isPending;
  const canSave = !!name.trim() && !!address.trim() && !busy;

  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.3)', zIndex: 40, backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div className="neo-sheet" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: 28, borderRadius: '28px 28px 0 0' }}>
      <div style={{ width: 40, height: 5, borderRadius: 3, background: '#C7C7CC', margin: '0 auto 24px' }} />
      <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 20px' }}>Add Lead</h2>
      {[
        { label: 'Name *', val: name, set: setName, ph: 'e.g., Jane Smith', inputMode: undefined as const },
        { label: 'Property Address *', val: address, set: setAddress, ph: '123 Main St, Springfield, MA', inputMode: undefined as const },
        { label: 'Phone', val: phone, set: setPhone, ph: '(413) 555-0000', inputMode: 'tel' as const },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, display: 'block' }}>{f.label}</label>
          <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} inputMode={f.inputMode} className="neo-input" style={{ height: 48 }} />
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
      {err && <p style={{ fontSize: 13, color: C.red, fontWeight: 600, margin: '-8px 0 12px' }}>{err}</p>}
      <button onClick={save} disabled={!canSave} className="maya-tile press-sm" style={{ width: '100%', height: 52, borderRadius: 16, background: C.teal, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: 0, opacity: canSave ? 1 : 0.45 }}>
        {busy ? 'Saving…' : 'Save Lead'}
      </button>
      <button onClick={onClose} style={{ width: '100%', marginTop: 10, height: 44, background: 'transparent', color: C.muted, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', borderRadius: 16 }}>Cancel</button>
    </div>
  </>;
}
