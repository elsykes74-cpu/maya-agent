import { useState, useEffect } from 'react';
import {
  Plus, PhoneCall, Pause, Play, Trash2, Megaphone, MessageSquare,
  ChevronDown, ChevronUp, Flame, Zap, Snowflake, TrendingUp, CheckCircle, Pencil, X,
} from 'lucide-react';
import { C, NeoTile, NeoIcon, ConfirmSheet } from '@/components/Neo';
import {
  loadLeads, loadCampaigns, saveCampaigns, seedDripCampaigns, updateCampaignLeadStatus,
} from '@/lib/persistence';
import type { Campaign, CampaignLead, SequenceStep } from '@/lib/persistence';

// ── Sequence templates ────────────────────────────────────────────

const TEMPLATES = {
  quick_strike: {
    label: 'Quick Strike',
    desc: '5-day blitz',
    accentColor: '#FF6B6B',
    steps: [
      { day: 1, channel: 'call' as const, scriptKey: 'initial_offer' },
      { day: 2, channel: 'sms' as const, scriptKey: 'follow_up_sms' },
      { day: 4, channel: 'call' as const, scriptKey: 'second_call' },
      { day: 5, channel: 'sms' as const, scriptKey: 'final_sms' },
    ],
  },
  warm_nurture: {
    label: 'Warm Nurture',
    desc: '14-day build',
    accentColor: '#FFB340',
    steps: [
      { day: 1, channel: 'call' as const, scriptKey: 'initial_offer' },
      { day: 3, channel: 'sms' as const, scriptKey: 'follow_up_sms' },
      { day: 7, channel: 'call' as const, scriptKey: 'second_call' },
      { day: 14, channel: 'sms' as const, scriptKey: 'final_sms' },
    ],
  },
  cold_drip: {
    label: 'Cold Drip',
    desc: '30-day slow burn',
    accentColor: '#60A5FA',
    steps: [
      { day: 1, channel: 'sms' as const, scriptKey: 'follow_up_sms' },
      { day: 7, channel: 'call' as const, scriptKey: 'initial_offer' },
      { day: 14, channel: 'sms' as const, scriptKey: 'follow_up_sms' },
      { day: 30, channel: 'call' as const, scriptKey: 'second_call' },
    ],
  },
};

export const SCRIPTS: Record<string, string> = {
  initial_offer: "Hi {{name}}, I'm a local cash buyer interested in your property at {{address}}. I can close in 14 days as-is — no repairs, no fees. Would you be open to a quick chat?",
  follow_up_sms: "Hi {{name}}, following up about your property. I have a cash offer ready — no repairs needed, close on your timeline. Reply YES to learn more.",
  second_call: "Hi {{name}}, calling again about your property. My cash offer is still on the table. I can close in as little as 7 days and make this easy for you.",
  final_sms: "Hi {{name}}, last message about your property. Fair cash offer, fast close, no hassle. Reply STOP to opt out, or call me to discuss.",
  voicemail_sms_1: "Hi {{name}}, I left you a voicemail about your property. I have a cash offer ready — no repairs, close fast. Would you have a few minutes to chat?",
};

// ── Analytics helper ──────────────────────────────────────────────

function stats(camp: Campaign) {
  const total = camp.leads.length;
  const contacted = camp.leads.filter(l => l.status !== 'pending').length;
  const connected = camp.leads.filter(l => l.status === 'connected' || l.status === 'converted' || l.status === 'callback').length;
  const converted = camp.leads.filter(l => l.status === 'converted').length;
  const contactRate = total > 0 ? Math.round(contacted / total * 100) : 0;
  const connectRate = total > 0 ? Math.round(connected / total * 100) : 0;
  return { total, contacted, connected, converted, contactRate, connectRate };
}

// ── Main page ─────────────────────────────────────────────────────

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [confirmData, setConfirmData] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    seedDripCampaigns();
    setCampaigns(loadCampaigns());
  }, []);

  const refresh = () => setCampaigns(loadCampaigns());

  const persist = (updated: Campaign[]) => { setCampaigns(updated); saveCampaigns(updated); };

  const toggleStatus = (id: number) =>
    persist(campaigns.map(c => c.id === id
      ? { ...c, status: (c.status === 'active' ? 'paused' : 'active') as Campaign['status'] }
      : c));

  const remove = (id: number) => {
    const camp = campaigns.find(c => c.id === id);
    if (!camp) return;
    setConfirmData({
      title: 'Delete Campaign',
      desc: `Remove "${camp.name}"? This cannot be undone.`,
      onConfirm: () => { persist(campaigns.filter(c => c.id !== id)); setConfirmData(null); },
    });
  };

  const handleLeadStatusChange = (campaignId: number, leadId: number, status: CampaignLead['status']) => {
    updateCampaignLeadStatus(campaignId, leadId, status);
    refresh();
  };

  const counts = {
    active: campaigns.filter(c => c.status === 'active').length,
    paused: campaigns.filter(c => c.status === 'paused').length,
    done: campaigns.filter(c => c.status === 'completed').length,
  };

  const global = campaigns.reduce(
    (acc, c) => { const s = stats(c); return { total: acc.total + s.total, contacted: acc.contacted + s.contacted, connected: acc.connected + s.connected, converted: acc.converted + s.converted }; },
    { total: 0, contacted: 0, connected: 0, converted: 0 }
  );

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Campaigns</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', fontWeight: 500 }}>Multi-touch drop sequences</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="press-sm"
          aria-label="New campaign"
          style={{ width: 48, height: 48, borderRadius: 16, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, boxShadow: `0 6px 18px ${C.teal}44` }}
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </button>
      </div>

      {/* Status pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <StatusPill count={counts.active} label="Active" color={C.green} />
        <StatusPill count={counts.paused} label="Paused" color={C.orange} />
        <StatusPill count={counts.done} label="Done" color={C.blue} />
      </div>

      {/* Global analytics */}
      {campaigns.length > 0 && (
        <NeoTile style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Overall Performance</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            <StatBox value={global.total} label="Leads" color={C.blue} />
            <StatBox value={global.contacted} label="Contacted" color={C.orange} />
            <StatBox value={global.connected} label="Connected" color={C.teal} />
            <StatBox value={global.converted} label="Converted" color={C.green} />
          </div>
          {global.total > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                <span>Contact Rate</span>
                <span style={{ color: C.teal }}>{Math.round(global.contacted / global.total * 100)}%</span>
              </div>
              <div className="maya-progress-track">
                <div className="maya-progress-fill" style={{ width: `${Math.round(global.contacted / global.total * 100)}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.blue})` }} />
              </div>
              {global.connected > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 0 5px' }}>
                    <span>Connect Rate</span>
                    <span style={{ color: C.green }}>{Math.round(global.connected / global.total * 100)}%</span>
                  </div>
                  <div className="maya-progress-track">
                    <div className="maya-progress-fill" style={{ width: `${Math.round(global.connected / global.total * 100)}%`, background: `linear-gradient(90deg, ${C.green}, ${C.teal})` }} />
                  </div>
                </>
              )}
            </>
          )}
        </NeoTile>
      )}

      {/* Campaign cards */}
      {campaigns.map(camp => (
        <CampaignCard
          key={camp.id}
          campaign={camp}
          expanded={expandedId === camp.id}
          onToggleExpand={() => setExpandedId(expandedId === camp.id ? null : camp.id)}
          onToggleStatus={() => toggleStatus(camp.id)}
          onDelete={() => remove(camp.id)}
          onEdit={() => setEditingCampaign(camp)}
          onLeadStatusChange={(leadId, status) => handleLeadStatusChange(camp.id, leadId, status)}
        />
      ))}

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <NeoIcon bg={C.tealS} size={72} round={24} style={{ margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={32} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>No campaigns yet</p>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 24px', lineHeight: 1.6 }}>Create a drop sequence to automatically contact leads across multiple touchpoints — calls, SMS, and follow-ups all in one.</p>
          <button onClick={() => setShowCreate(true)} className="maya-tile press-sm" style={{ padding: '14px 28px', borderRadius: 18, background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} strokeWidth={2.5} /> Create First Campaign
          </button>
        </div>
      )}

      {showCreate && (
        <CreateSheet
          onClose={() => setShowCreate(false)}
          onCreate={camp => { persist([...campaigns, camp]); setShowCreate(false); }}
        />
      )}

      {editingCampaign && (
        <EditCampaignSheet
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onSave={updated => {
            persist(campaigns.map(c => c.id === updated.id ? updated : c));
            setEditingCampaign(null);
          }}
        />
      )}

      {confirmData && (
        <ConfirmSheet open title={confirmData.title} desc={confirmData.desc} danger onConfirm={confirmData.onConfirm} onCancel={() => setConfirmData(null)} />
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────

function CampaignCard({ campaign, expanded, onToggleExpand, onToggleStatus, onDelete, onEdit, onLeadStatusChange }: {
  campaign: Campaign; expanded: boolean;
  onToggleExpand: () => void; onToggleStatus: () => void; onDelete: () => void;
  onEdit: () => void;
  onLeadStatusChange: (leadId: number, status: CampaignLead['status']) => void;
}) {
  const s = stats(campaign);
  const tpl = TEMPLATES[campaign.sequenceTemplate as keyof typeof TEMPLATES];
  const accent = tpl?.accentColor ?? C.teal;

  const motColor = campaign.motivationFilter === 'hot' ? C.red
    : campaign.motivationFilter === 'warm' ? C.orange
    : campaign.motivationFilter === 'cold' ? C.blue : C.purple;

  const motLabel = campaign.motivationFilter === 'all' ? 'All Leads'
    : campaign.motivationFilter.charAt(0).toUpperCase() + campaign.motivationFilter.slice(1) + ' Leads';

  return (
    <NeoTile style={{ marginBottom: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{campaign.name}</p>
            {campaign.isSystemDrip && (
              <span style={{ fontSize: 9, fontWeight: 800, color: C.teal, background: C.tealS, padding: '2px 7px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto</span>
            )}
          </div>
          {campaign.description && <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{campaign.description}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase',
            background: campaign.status === 'active' ? C.greenS : campaign.status === 'paused' ? C.orangeS : C.blueS,
            color: campaign.status === 'active' ? C.green : campaign.status === 'paused' ? C.orange : C.blue }}>
            {campaign.status}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: motColor + '20', color: motColor }}>
            {motLabel}
          </span>
        </div>
      </div>

      {/* Sequence timeline */}
      <SequenceTimeline steps={campaign.sequence} accent={accent} />

      {/* Mini stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '12px 0' }}>
        <MiniStat value={s.total} label="Leads" color={C.blue} />
        <MiniStat value={s.contacted} label="Touched" color={C.orange} />
        <MiniStat value={s.connected} label="Connected" color={C.teal} />
        <MiniStat value={s.converted} label="Converted" color={C.green} />
      </div>

      {/* Contact rate bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
          <span>Contact Rate</span>
          <span style={{ color: accent }}>{s.contactRate}%</span>
        </div>
        <div className="maya-progress-track">
          <div className="maya-progress-fill" style={{ width: `${s.contactRate}%`, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
        </div>
      </div>

      {/* Lead list toggle */}
      {campaign.leads.length > 0 && (
        <button onClick={onToggleExpand} className="press-sm" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, background: 'rgba(0,0,0,0.03)', border: `1px solid ${accent}22`, cursor: 'pointer', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            {expanded ? 'Hide' : 'View'} {campaign.leads.length} Lead{campaign.leads.length !== 1 ? 's' : ''}
          </span>
          {expanded ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
        </button>
      )}

      {expanded && (
        <div style={{ marginBottom: 10, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
          {campaign.leads.map((lead, i) => (
            <LeadRow
              key={lead.leadId}
              lead={lead}
              last={i === campaign.leads.length - 1}
              onStatusChange={status => onLeadStatusChange(lead.leadId, status)}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onToggleStatus} className="maya-tile press-sm" style={{ flex: 1, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 0, color: '#fff', fontWeight: 700, fontSize: 14,
          background: campaign.status === 'active' ? C.orange : `linear-gradient(135deg, ${C.teal}, ${C.green})` }}>
          {campaign.status === 'active'
            ? <><Pause size={15} strokeWidth={2.5} /> Pause</>
            : <><Play size={15} fill="white" strokeWidth={0} /> Resume</>}
        </button>
        <button onClick={onEdit} className="neo-pressed-sm press-sm" style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Pencil size={16} color={C.teal} strokeWidth={2} />
        </button>
        <button onClick={onDelete} className="neo-pressed-sm press-sm" style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={16} color={C.red} strokeWidth={2} />
        </button>
      </div>
    </NeoTile>
  );
}

// ── Sequence timeline ─────────────────────────────────────────────

function SequenceTimeline({ steps, accent }: { steps: SequenceStep[]; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }} className="hide-scrollbar">
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: accent + '18', border: `2px solid ${accent}45`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {step.channel === 'call'
                ? <PhoneCall size={14} color={accent} strokeWidth={2} />
                : <MessageSquare size={14} color={accent} strokeWidth={2} />}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>D{step.day}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: C.tertiary, textTransform: 'uppercase' }}>{step.channel}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 22, height: 2, background: `linear-gradient(90deg, ${accent}50, ${accent}20)`, flexShrink: 0, margin: '0 2px', marginBottom: 22 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Lead row ──────────────────────────────────────────────────────

const LEAD_STATUS_OPTIONS: CampaignLead['status'][] = [
  'pending', 'connected', 'voicemail', 'no_answer', 'callback', 'not_interested', 'converted', 'dnc',
];

const STATUS_LABELS: Record<CampaignLead['status'], string> = {
  pending: 'Pending',
  connected: 'Connected',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
  callback: 'Callback',
  not_interested: 'Not Interested',
  converted: 'Converted',
  dnc: 'DNC',
};

function LeadRow({ lead, last, onStatusChange }: {
  lead: CampaignLead; last: boolean;
  onStatusChange: (status: CampaignLead['status']) => void;
}) {
  const [open, setOpen] = useState(false);

  const statusColor = lead.status === 'connected' || lead.status === 'converted' || lead.status === 'callback' ? C.green
    : lead.status === 'voicemail' ? C.orange
    : lead.status === 'no_answer' || lead.status === 'dnc' ? C.red
    : lead.status === 'not_interested' ? C.muted
    : C.muted;

  const motColor = lead.motivationLevel === 'hot' ? C.red
    : lead.motivationLevel === 'warm' ? C.orange : C.blue;

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.04)', background: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: motColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.leadName}
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: statusColor + '15', border: `1px solid ${statusColor}30`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{STATUS_LABELS[lead.status]}</span>
          <ChevronDown size={10} color={statusColor} />
        </button>
      </div>
      {open && (
        <div style={{ padding: '4px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LEAD_STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onStatusChange(s); setOpen(false); }}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 16,
                background: lead.status === s ? statusColor + '20' : 'rgba(0,0,0,0.04)',
                border: lead.status === s ? `1.5px solid ${statusColor}` : '1.5px solid transparent',
                color: lead.status === s ? statusColor : C.muted, cursor: 'pointer' }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat components ───────────────────────────────────────────────

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 14, background: color + '12' }}>
      <p style={{ fontSize: 26, fontWeight: 900, color, margin: 0, lineHeight: 1, letterSpacing: '-1px' }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </div>
  );
}

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 2px', borderRadius: 10, background: color + '12' }}>
      <p style={{ fontSize: 18, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
    </div>
  );
}

function StatusPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: color + '15', border: `1px solid ${color}30` }}>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
    </div>
  );
}

// ── Edit campaign sheet ───────────────────────────────────────────

function EditCampaignSheet({ campaign, onClose, onSave }: {
  campaign: Campaign;
  onClose: () => void;
  onSave: (updated: Campaign) => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [desc, setDesc] = useState(campaign.description);
  const [status, setStatus] = useState(campaign.status);

  const STATUS_OPTS: Campaign['status'][] = ['active', 'paused', 'completed', 'draft'];
  const STATUS_COLORS: Record<Campaign['status'], string> = {
    active: C.green, paused: C.orange, completed: C.blue, draft: C.muted,
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ ...campaign, name: name.trim(), description: desc.trim(), status });
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div className="neo-sheet hide-scrollbar" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: '24px 24px 44px', borderRadius: '28px 28px 0 0', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)', margin: '0 auto 24px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Edit Campaign</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 12, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} color={C.muted} />
          </button>
        </div>

        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Campaign Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className="neo-input" style={{ marginBottom: 16 }} />

        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} className="neo-input" style={{ marginBottom: 20 }} />

        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 10 }}>Status</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 28 }}>
          {STATUS_OPTS.map(s => (
            <button key={s} onClick={() => setStatus(s)} className="press-sm" style={{ padding: '10px 4px', borderRadius: 14, border: `2px solid ${status === s ? STATUS_COLORS[s] : 'transparent'}`, background: status === s ? STATUS_COLORS[s] + '15' : 'rgba(0,0,0,0.04)', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: status === s ? STATUS_COLORS[s] : C.muted, textTransform: 'capitalize' }}>{s}</span>
            </button>
          ))}
        </div>

        <button onClick={handleSave} disabled={!name.trim()} className="maya-tile press-sm" style={{ width: '100%', height: 56, borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 17, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, opacity: !name.trim() ? 0.4 : 1 }}>
          Save Changes
        </button>
        <button onClick={onClose} style={{ width: '100%', marginTop: 12, fontSize: 16, color: C.muted, background: 'none', border: 'none', padding: 12, cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
      </div>
    </>
  );
}

// ── Create sheet ──────────────────────────────────────────────────

function CreateSheet({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (campaign: Campaign) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [motFilter, setMotFilter] = useState<Campaign['motivationFilter']>('all');
  const [templateKey, setTemplateKey] = useState<keyof typeof TEMPLATES>('quick_strike');

  const allLeads = loadLeads();
  const matching = allLeads.filter(l => motFilter === 'all' || l.motivationLevel === motFilter);

  const handleCreate = () => {
    if (!name.trim() || matching.length === 0) return;
    const tpl = TEMPLATES[templateKey];
    const leads: CampaignLead[] = matching.map(l => ({
      leadId: l.id, leadName: l.sellerName, phone: l.phone,
      motivationLevel: l.motivationLevel, status: 'pending', currentStep: 0, lastContactedAt: null,
    }));
    onCreate({
      id: Date.now(), name: name.trim(), description: desc.trim(),
      status: 'active', motivationFilter: motFilter, sequenceTemplate: templateKey,
      sequence: tpl.steps, leads, createdAt: new Date().toISOString(),
    });
  };

  const MOT_OPTS = [
    { key: 'all' as const, label: 'All', icon: <TrendingUp size={15} />, color: C.purple },
    { key: 'hot' as const, label: 'Hot 🔥', icon: <Flame size={15} />, color: C.red },
    { key: 'warm' as const, label: 'Warm', icon: <Zap size={15} />, color: C.orange },
    { key: 'cold' as const, label: 'Cold', icon: <Snowflake size={15} />, color: C.blue },
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40, backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div className="neo-sheet hide-scrollbar" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 50, padding: '24px 24px 44px', borderRadius: '28px 28px 0 0', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)', margin: '0 auto 24px' }} />
        <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.02em' }}>New Campaign</h2>

        {/* Name */}
        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Campaign Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Springfield Hot List Blitz" className="neo-input" style={{ marginBottom: 16 }} />

        {/* Description */}
        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Description (optional)</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this campaign targeting?" className="neo-input" style={{ marginBottom: 20 }} />

        {/* Motivation filter */}
        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 10 }}>Lead Filter</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
          {MOT_OPTS.map(opt => (
            <button key={opt.key} onClick={() => setMotFilter(opt.key)} className="press-sm" style={{ padding: '12px 4px', borderRadius: 14, border: `2px solid ${motFilter === opt.key ? opt.color : 'transparent'}`, background: motFilter === opt.key ? opt.color + '15' : 'rgba(0,0,0,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <span style={{ color: opt.color }}>{opt.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: motFilter === opt.key ? opt.color : C.muted }}>{opt.label}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, color: matching.length > 0 ? C.teal : C.red, fontWeight: 700, margin: '0 0 20px' }}>
          {matching.length > 0 ? `✓ ${matching.length} lead${matching.length !== 1 ? 's' : ''} match this filter` : 'No leads match — upload leads first'}
        </p>

        {/* Sequence template */}
        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 10 }}>Drop Sequence</label>
        {(Object.entries(TEMPLATES) as [keyof typeof TEMPLATES, typeof TEMPLATES[keyof typeof TEMPLATES]][]).map(([key, tpl]) => (
          <button key={key} onClick={() => setTemplateKey(key)} className="press-sm" style={{ width: '100%', marginBottom: 10, padding: '14px 14px 10px', borderRadius: 18, border: `2px solid ${templateKey === key ? tpl.accentColor : 'transparent'}`, background: templateKey === key ? tpl.accentColor + '10' : 'rgba(0,0,0,0.04)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: templateKey === key ? tpl.accentColor : C.text }}>{tpl.label}</span>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tpl.desc}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {tpl.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: tpl.accentColor + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.channel === 'call' ? <PhoneCall size={12} color={tpl.accentColor} /> : <MessageSquare size={12} color={tpl.accentColor} />}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.muted }}>D{s.day}</span>
                  </div>
                  {i < tpl.steps.length - 1 && <div style={{ width: 18, height: 2, background: tpl.accentColor + '30', margin: '0 2px', marginBottom: 16 }} />}
                </div>
              ))}
            </div>
          </button>
        ))}

        {/* Script preview */}
        <div className="neo-pressed-sm" style={{ padding: 14, marginBottom: 24, marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Day 1 Script Preview</p>
          <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.55, fontWeight: 500 }}>{SCRIPTS[TEMPLATES[templateKey].steps[0].scriptKey]}</p>
        </div>

        <button onClick={handleCreate} disabled={!name.trim() || matching.length === 0} className="maya-tile press-sm" style={{ width: '100%', height: 56, borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 17, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, opacity: (!name.trim() || matching.length === 0) ? 0.4 : 1 }}>
          {matching.length > 0 ? `Launch Campaign · ${matching.length} Leads` : 'Upload Leads First'}
        </button>
        <button onClick={onClose} style={{ width: '100%', marginTop: 12, fontSize: 16, color: C.muted, background: 'none', border: 'none', padding: 12, cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
      </div>
    </>
  );
}
