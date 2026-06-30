import { useState, useEffect, useMemo } from 'react';
import {
  Plus, PhoneCall, Pause, Play, Trash2, Megaphone, MessageSquare,
  ChevronDown, ChevronUp, Flame, Zap, Snowflake, TrendingUp, CheckCircle, Pencil, X,
  AlertCircle, Clock, Bot, Send,
} from 'lucide-react';
import { C, NeoTile, NeoIcon, ConfirmSheet } from '@/components/Neo';
import {
  loadLeads, loadCampaigns, saveCampaigns, seedDripCampaigns, updateCampaignLeadStatus,
  loadLeadCallLogs, assignLeadToCampaign, OUTCOME_TO_CAMPAIGN,
} from '@/lib/persistence';
import type { Campaign, CampaignLead, SequenceStep, CallOutcome, Lead } from '@/lib/persistence';
import { trpc } from '@/providers/trpc';

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

// ── Step scheduling helpers ───────────────────────────────────────

function dayOfCampaign(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function getLeadDueStatus(lead: CampaignLead, sequence: SequenceStep[], createdAt: string): {
  isDue: boolean; isOverdue: boolean; daysUntil: number; nextStep: SequenceStep | null; stepIndex: number;
} {
  const done = ['converted', 'dnc', 'not_interested'].includes(lead.status);
  if (done || lead.currentStep >= sequence.length) {
    return { isDue: false, isOverdue: false, daysUntil: 0, nextStep: null, stepIndex: lead.currentStep };
  }
  const nextStep = sequence[lead.currentStep];
  const day = dayOfCampaign(createdAt);
  const daysUntil = nextStep.day - day;
  return {
    isDue: daysUntil <= 0,
    isOverdue: daysUntil < 0,
    daysUntil,
    nextStep,
    stepIndex: lead.currentStep,
  };
}

function fillScript(scriptKey: string, name: string, address: string): string {
  const firstName = name.split(' ')[0] || name;
  return (SCRIPTS[scriptKey] ?? '')
    .replace(/\{\{name\}\}/g, firstName)
    .replace(/\{\{address\}\}/g, address || 'your property');
}

// ── Backfill call logs into campaigns ────────────────────────────

const OUTCOME_TO_CAMPAIGN_STATUS: Record<CallOutcome, CampaignLead['status']> = {
  voicemail:                'voicemail',
  connected_interested:     'connected',
  connected_not_interested: 'not_interested',
  callback_requested:       'callback',
  no_answer:                'no_answer',
  hung_up:                  'no_answer',
};

function backfillFromCallLogs() {
  const logs = loadLeadCallLogs();
  if (logs.length === 0) return;
  const leads = loadLeads();
  const leadMap = new Map(leads.map(l => [l.id, l]));
  for (const log of logs) {
    const campaignName = log.campaignAssigned ?? OUTCOME_TO_CAMPAIGN[log.outcome];
    if (!campaignName) continue;
    const lead = leadMap.get(log.leadId);
    const motivationLevel = lead?.motivationLevel ?? 'warm';
    assignLeadToCampaign({ leadId: log.leadId, leadName: log.leadName, phone: log.phone, motivationLevel }, campaignName);
    const campaigns = loadCampaigns();
    const campaign = campaigns.find(c => c.name === campaignName);
    if (campaign) {
      const campLead = campaign.leads.find(l => l.leadId === log.leadId);
      if (campLead && campLead.status === 'pending') {
        updateCampaignLeadStatus(campaign.id, log.leadId, OUTCOME_TO_CAMPAIGN_STATUS[log.outcome] ?? 'pending');
      }
    }
  }
}

// ── Analytics helper ──────────────────────────────────────────────

function stats(camp: Campaign) {
  const total = camp.leads.length;
  const contacted = camp.leads.filter(l => l.status !== 'pending').length;
  const connected = camp.leads.filter(l => l.status === 'connected' || l.status === 'converted' || l.status === 'callback').length;
  const converted = camp.leads.filter(l => l.status === 'converted').length;
  const contactRate = total > 0 ? Math.round(contacted / total * 100) : 0;
  const connectRate = total > 0 ? Math.round(connected / total * 100) : 0;
  const overdue = camp.leads.filter(l => getLeadDueStatus(l, camp.sequence, camp.createdAt).isOverdue).length;
  const dueToday = camp.leads.filter(l => { const d = getLeadDueStatus(l, camp.sequence, camp.createdAt); return d.isDue && !d.isOverdue; }).length;
  return { total, contacted, connected, converted, contactRate, connectRate, overdue, dueToday };
}

// ── Main page ─────────────────────────────────────────────────────

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [confirmData, setConfirmData] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);

  const { data: allCallsData } = trpc.maya.allRecordings.useQuery(undefined, { staleTime: 60_000 });

  const leadMap = useMemo(() => new Map(allLeads.map(l => [l.id, l])), [allLeads]);

  const callMap = useMemo(() => {
    const map = new Map<string, { count: number; lastDate: string; lastOutcome: string | null }>();
    for (const c of allCallsData?.calls ?? []) {
      const key = c.phone.replace(/\D/g, '').slice(-10);
      if (!map.has(key)) map.set(key, { count: 1, lastDate: c.date, lastOutcome: c.lastOutcome });
      else map.get(key)!.count++;
    }
    return map;
  }, [allCallsData]);

  useEffect(() => {
    seedDripCampaigns();
    backfillFromCallLogs();
    setCampaigns(loadCampaigns());
    setAllLeads(loadLeads());
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

  const handleStepAdvance = (campaignId: number, leadId: number) => {
    const updated = campaigns.map(c => {
      if (c.id !== campaignId) return c;
      return {
        ...c,
        leads: c.leads.map(l => {
          if (l.leadId !== leadId) return l;
          const nextStep = l.currentStep + 1;
          return { ...l, currentStep: nextStep, lastContactedAt: new Date().toISOString() };
        }),
      };
    });
    persist(updated);
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

  // Build today's action queue across all active campaigns
  type ActionItem = { lead: CampaignLead; campaign: Campaign; dueStatus: ReturnType<typeof getLeadDueStatus>; address: string };
  const todayActions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    for (const camp of campaigns) {
      if (camp.status !== 'active') continue;
      for (const lead of camp.leads) {
        const dueStatus = getLeadDueStatus(lead, camp.sequence, camp.createdAt);
        if (dueStatus.isDue) {
          const fullLead = leadMap.get(lead.leadId);
          items.push({ lead, campaign: camp, dueStatus, address: fullLead?.propertyAddress ?? '' });
        }
      }
    }
    return items.sort((a, b) => a.dueStatus.daysUntil - b.dueStatus.daysUntil);
  }, [campaigns, leadMap]);

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
        {todayActions.length > 0 && (
          <StatusPill count={todayActions.length} label="Due Today" color={C.red} />
        )}
      </div>

      {/* Today's action queue */}
      {todayActions.length > 0 && (
        <NeoTile style={{ marginBottom: 20, border: `1.5px solid ${C.orange}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} color={C.orange} strokeWidth={2} />
            <p style={{ fontSize: 13, fontWeight: 800, color: C.orange, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {todayActions.length} Action{todayActions.length !== 1 ? 's' : ''} Due Today
            </p>
          </div>
          {todayActions.slice(0, 6).map(({ lead, campaign, dueStatus, address }) => (
            <ActionQueueRow
              key={`${campaign.id}-${lead.leadId}`}
              lead={lead}
              campaign={campaign}
              dueStatus={dueStatus}
              address={address}
              onAdvance={() => { handleStepAdvance(campaign.id, lead.leadId); handleLeadStatusChange(campaign.id, lead.leadId, 'connected'); }}
            />
          ))}
          {todayActions.length > 6 && (
            <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: '8px 0 0', fontWeight: 600 }}>
              +{todayActions.length - 6} more — see campaigns below
            </p>
          )}
        </NeoTile>
      )}

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
              {global.converted > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: '10px 0 0', textAlign: 'center' }}>
                  🎉 {global.converted} deal{global.converted !== 1 ? 's' : ''} converted · {global.total > 0 ? Math.round(global.converted / global.total * 100) : 0}% close rate
                </p>
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
          leadMap={leadMap}
          callMap={callMap}
          onToggleExpand={() => setExpandedId(expandedId === camp.id ? null : camp.id)}
          onToggleStatus={() => toggleStatus(camp.id)}
          onDelete={() => remove(camp.id)}
          onEdit={() => setEditingCampaign(camp)}
          onLeadStatusChange={(leadId, status) => handleLeadStatusChange(camp.id, leadId, status)}
          onStepAdvance={(leadId) => handleStepAdvance(camp.id, leadId)}
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

// ── Today's action queue row ──────────────────────────────────────

function ActionQueueRow({ lead, campaign, dueStatus, address, onAdvance }: {
  lead: CampaignLead;
  campaign: Campaign;
  dueStatus: ReturnType<typeof getLeadDueStatus>;
  address: string;
  onAdvance: () => void;
}) {
  const sendSms = trpc.sms.sendOne.useMutation();
  const [sent, setSent] = useState(false);

  const handleSms = async () => {
    if (!dueStatus.nextStep || !lead.phone) return;
    const text = fillScript(dueStatus.nextStep.scriptKey, lead.leadName, address);
    await sendSms.mutateAsync({ to: lead.phone, body: text });
    setSent(true);
    onAdvance();
  };

  const isCall = dueStatus.nextStep?.channel === 'call';
  const isOverdue = dueStatus.isOverdue;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: isOverdue ? C.redS : C.orangeS, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isCall ? <PhoneCall size={14} color={isOverdue ? C.red : C.orange} strokeWidth={2} /> : <MessageSquare size={14} color={isOverdue ? C.red : C.orange} strokeWidth={2} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.leadName}
        </p>
        <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {campaign.name} · Step {(dueStatus.stepIndex ?? 0) + 1}/{campaign.sequence.length} · {isOverdue ? `${Math.abs(dueStatus.daysUntil)}d overdue` : 'Due today'}
        </p>
      </div>
      {sent ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>✓ Done</span>
      ) : isCall ? (
        <a href={`tel:${lead.phone.replace(/\D/g, '')}`}
          onClick={onAdvance}
          style={{ height: 34, paddingInline: 12, borderRadius: 10, background: C.teal, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', flexShrink: 0 }}>
          <PhoneCall size={12} strokeWidth={2.5} /> Call
        </a>
      ) : (
        <button onClick={handleSms} disabled={sendSms.isPending}
          style={{ height: 34, paddingInline: 12, borderRadius: 10, background: C.purple, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flexShrink: 0, opacity: sendSms.isPending ? 0.6 : 1 }}>
          <Send size={12} strokeWidth={2.5} /> {sendSms.isPending ? '…' : 'SMS'}
        </button>
      )}
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────

function CampaignCard({ campaign, expanded, leadMap, callMap, onToggleExpand, onToggleStatus, onDelete, onEdit, onLeadStatusChange, onStepAdvance }: {
  campaign: Campaign; expanded: boolean;
  leadMap: Map<number, Lead>;
  callMap: Map<string, { count: number; lastDate: string; lastOutcome: string | null }>;
  onToggleExpand: () => void; onToggleStatus: () => void; onDelete: () => void;
  onEdit: () => void;
  onLeadStatusChange: (leadId: number, status: CampaignLead['status']) => void;
  onStepAdvance: (leadId: number) => void;
}) {
  const s = stats(campaign);
  const tpl = TEMPLATES[campaign.sequenceTemplate as keyof typeof TEMPLATES];
  const accent = tpl?.accentColor ?? C.teal;

  const motColor = campaign.motivationFilter === 'hot' ? C.red
    : campaign.motivationFilter === 'warm' ? C.orange
    : campaign.motivationFilter === 'cold' ? C.blue : C.purple;

  const motLabel = campaign.motivationFilter === 'all' ? 'All Leads'
    : campaign.motivationFilter.charAt(0).toUpperCase() + campaign.motivationFilter.slice(1) + ' Leads';

  // Real call count from Maya data
  const totalRealCalls = campaign.leads.reduce((sum, lead) => {
    const key = lead.phone.replace(/\D/g, '').slice(-10);
    return sum + (callMap.get(key)?.count ?? 0);
  }, 0);

  return (
    <NeoTile style={{ marginBottom: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{campaign.name}</p>
            {campaign.isSystemDrip && (
              <span style={{ fontSize: 9, fontWeight: 800, color: C.teal, background: C.tealS, padding: '2px 7px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto</span>
            )}
            {s.overdue > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, color: C.red, background: C.redS, padding: '2px 7px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
                <AlertCircle size={10} /> {s.overdue} overdue
              </span>
            )}
            {s.dueToday > 0 && s.overdue === 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, color: C.orange, background: C.orangeS, padding: '2px 7px', borderRadius: 8 }}>
                {s.dueToday} due today
              </span>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '12px 0 10px' }}>
        <MiniStat value={s.total} label="Leads" color={C.blue} />
        <MiniStat value={s.contacted} label="Touched" color={C.orange} />
        <MiniStat value={s.connected} label="Connected" color={C.teal} />
        <MiniStat value={s.converted} label="Converted" color={C.green} />
      </div>

      {/* Real calls from Maya */}
      {totalRealCalls > 0 && (
        <p style={{ fontSize: 11, color: C.purple, fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Bot size={12} strokeWidth={2} /> {totalRealCalls} Maya call{totalRealCalls !== 1 ? 's' : ''} made
        </p>
      )}

      {/* Status breakdown bar */}
      {s.total > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 1, height: 6, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
            {s.converted > 0 && <div style={{ flex: s.converted, background: C.green }} />}
            {s.connected > 0 && <div style={{ flex: Math.max(0, s.connected - s.converted), background: C.teal }} />}
            {(s.contacted - s.connected) > 0 && <div style={{ flex: s.contacted - s.connected, background: C.orange }} />}
            {(s.total - s.contacted) > 0 && <div style={{ flex: s.total - s.contacted, background: 'rgba(0,0,0,0.08)' }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
            <span style={{ color: C.muted }}>Contact Rate <span style={{ color: accent }}>{s.contactRate}%</span></span>
            <span style={{ color: C.muted }}>Connect Rate <span style={{ color: C.teal }}>{s.connectRate}%</span></span>
          </div>
        </div>
      )}

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
              campaign={campaign}
              fullLead={leadMap.get(lead.leadId)}
              callSummary={callMap.get(lead.phone.replace(/\D/g, '').slice(-10))}
              last={i === campaign.leads.length - 1}
              onStatusChange={status => onLeadStatusChange(lead.leadId, status)}
              onStepAdvance={() => onStepAdvance(lead.leadId)}
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
  converted: '🎉 Converted',
  dnc: 'DNC',
};

function LeadRow({ lead, campaign, fullLead, callSummary, last, onStatusChange, onStepAdvance }: {
  lead: CampaignLead; campaign: Campaign; fullLead?: Lead;
  callSummary?: { count: number; lastDate: string; lastOutcome: string | null };
  last: boolean;
  onStatusChange: (status: CampaignLead['status']) => void;
  onStepAdvance: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const sendSms = trpc.sms.sendOne.useMutation();

  const dueStatus = getLeadDueStatus(lead, campaign.sequence, campaign.createdAt);
  const address = fullLead?.propertyAddress ?? '';
  const totalSteps = campaign.sequence.length;
  const stepsLeft = Math.max(0, totalSteps - lead.currentStep);
  const isDone = lead.currentStep >= totalSteps || ['converted', 'dnc', 'not_interested'].includes(lead.status);

  const statusColor = lead.status === 'converted' ? C.green
    : lead.status === 'connected' || lead.status === 'callback' ? C.teal
    : lead.status === 'voicemail' ? C.orange
    : lead.status === 'no_answer' || lead.status === 'dnc' ? C.red
    : lead.status === 'not_interested' ? C.muted
    : C.muted;

  const motColor = lead.motivationLevel === 'hot' ? C.red
    : lead.motivationLevel === 'warm' ? C.orange : C.blue;

  const handleSms = async () => {
    if (!dueStatus.nextStep || !lead.phone) return;
    const text = fillScript(dueStatus.nextStep.scriptKey, lead.leadName, address);
    await sendSms.mutateAsync({ to: lead.phone, body: text });
    setSmsSent(true);
    onStatusChange('connected');
    onStepAdvance();
  };

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.04)', background: dueStatus.isOverdue ? `${C.red}05` : 'transparent' }}>
      <div style={{ padding: '10px 14px' }}>
        {/* Top row: name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: motColor, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.leadName}
          </span>
          <button onClick={() => setOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: statusColor + '15', border: `1px solid ${statusColor}30`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{STATUS_LABELS[lead.status]}</span>
            <ChevronDown size={10} color={statusColor} />
          </button>
        </div>

        {/* Step progress + due status */}
        {!isDone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {/* Step progress dots */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {campaign.sequence.map((step, i) => (
                <div key={i} style={{
                  width: i < lead.currentStep ? 8 : 6,
                  height: i < lead.currentStep ? 8 : 6,
                  borderRadius: '50%',
                  background: i < lead.currentStep ? C.teal : i === lead.currentStep ? (dueStatus.isDue ? C.orange : C.muted) : 'rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>
              Step {lead.currentStep + 1}/{totalSteps}
            </span>
            {dueStatus.isDue && (
              <span style={{ fontSize: 11, fontWeight: 800, color: dueStatus.isOverdue ? C.red : C.orange, background: dueStatus.isOverdue ? C.redS : C.orangeS, borderRadius: 8, padding: '1px 6px' }}>
                {dueStatus.isOverdue ? `${Math.abs(dueStatus.daysUntil)}d overdue` : 'Due today'}
              </span>
            )}
            {!dueStatus.isDue && dueStatus.daysUntil > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} strokeWidth={2} /> in {dueStatus.daysUntil}d
              </span>
            )}
          </div>
        )}

        {/* Real call count from Maya */}
        {callSummary && callSummary.count > 0 && (
          <p style={{ fontSize: 11, color: C.teal, fontWeight: 600, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Bot size={10} strokeWidth={2} /> {callSummary.count} Maya call{callSummary.count !== 1 ? 's' : ''} · last {new Date(callSummary.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}

        {/* Action buttons when due */}
        {dueStatus.isDue && !isDone && dueStatus.nextStep && (
          <div style={{ display: 'flex', gap: 6 }}>
            {dueStatus.nextStep.channel === 'call' ? (
              <a href={`tel:${lead.phone.replace(/\D/g, '')}`}
                onClick={() => { onStatusChange('connected'); onStepAdvance(); }}
                style={{ flex: 1, height: 34, borderRadius: 10, background: C.teal, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}>
                <PhoneCall size={13} strokeWidth={2.5} /> Call Now
              </a>
            ) : smsSent ? (
              <div style={{ flex: 1, height: 34, borderRadius: 10, background: C.greenS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <CheckCircle size={13} color={C.green} strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>SMS Sent</span>
              </div>
            ) : (
              <button onClick={handleSms} disabled={sendSms.isPending}
                style={{ flex: 1, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', opacity: sendSms.isPending ? 0.6 : 1 }}>
                <Send size={13} strokeWidth={2.5} /> {sendSms.isPending ? 'Sending…' : 'Send SMS'}
              </button>
            )}
            <button onClick={() => { onStatusChange('no_answer'); onStepAdvance(); }}
              className="neo-pressed-sm"
              style={{ height: 34, paddingInline: 10, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: C.muted }}>
              Skip
            </button>
          </div>
        )}

        {isDone && lead.status === 'converted' && (
          <p style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: 0 }}>🎉 Deal converted!</p>
        )}
      </div>

      {open && (
        <div style={{ padding: '4px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LEAD_STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => { onStatusChange(s); setOpen(false); }}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 16,
                background: lead.status === s ? statusColor + '20' : 'rgba(0,0,0,0.04)',
                border: lead.status === s ? `1.5px solid ${statusColor}` : '1.5px solid transparent',
                color: lead.status === s ? statusColor : C.muted, cursor: 'pointer' }}>
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

        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Campaign Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Springfield Hot List Blitz" className="neo-input" style={{ marginBottom: 16 }} />

        <label style={{ fontSize: 14, fontWeight: 700, color: C.text, display: 'block', marginBottom: 8 }}>Description (optional)</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this campaign targeting?" className="neo-input" style={{ marginBottom: 20 }} />

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
