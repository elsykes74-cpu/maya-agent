import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, PhoneCall, Users, Target, Activity, DollarSign, Clock } from 'lucide-react';
import { C, NeoTile, NeoIcon } from '@/components/Neo';
import { loadLeads, loadLeadCallLogs, loadCampaigns, loadAudit, OUTCOME_LABELS } from '@/lib/persistence';
import type { LeadCallLog, AuditEntry } from '@/lib/persistence';
import { fetchPipelineStages, fetchCallMetrics, fetchRecentActivity } from '@/lib/sync';

const PIPELINE_ORDER = ['lead', 'outreach', 'scoring', 'hot_routing', 'warm_nurture', 'cold_drip', 'appointment', 'close'];
const PIPELINE_LABELS: Record<string, string> = {
  lead: 'New Lead', outreach: 'Outreach', scoring: 'Scoring',
  hot_routing: 'Hot Route', warm_nurture: 'Warm Nurture',
  cold_drip: 'Cold Drip', appointment: 'Appointment', close: 'Closed',
};
const PIPELINE_COLORS: Record<string, string> = {
  lead: C.muted, outreach: C.blue, scoring: C.purple, hot_routing: C.red,
  warm_nurture: C.orange, cold_drip: C.teal, appointment: C.green, close: '#FFD700',
};

const OUTCOME_COLORS: Record<string, string> = {
  voicemail: C.orange,
  connected_interested: C.green,
  connected_not_interested: C.muted,
  callback_requested: C.teal,
  no_answer: C.blue,
  hung_up: C.red,
  other: C.muted,
};

const AUDIT_COLORS: Record<string, string> = {
  lead_added: C.green,
  lead_updated: C.blue,
  lead_deleted: C.red,
  call_logged: C.teal,
  campaign_assigned: C.purple,
};

const AUDIT_LABELS: Record<string, string> = {
  lead_added: 'Lead Added',
  lead_updated: 'Lead Updated',
  lead_deleted: 'Lead Deleted',
  call_logged: 'Call Logged',
  campaign_assigned: 'Campaign Assigned',
};

type Range = 'today' | '7d' | '30d';

function filterByRange(logs: LeadCallLog[], range: Range): LeadCallLog[] {
  const now = Date.now();
  const cutoff = range === 'today'
    ? new Date().setHours(0, 0, 0, 0)
    : range === '7d' ? now - 7 * 86400_000
    : now - 30 * 86400_000;
  return logs.filter(l => new Date(l.createdAt).getTime() >= cutoff);
}

export default function Analytics() {
  const [range, setRange] = useState<Range>('7d');
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<LeadCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // Local data
  const allLeads = loadLeads();
  const allLogs = loadLeadCallLogs();
  const campaigns = loadCampaigns();

  const logs = filterByRange(allLogs, range);

  useEffect(() => {
    setAudit(loadAudit());
    setLoading(true);
    Promise.all([
      fetchPipelineStages().then(setPipeline),
      fetchRecentActivity(30).then(setActivity),
    ]).finally(() => setLoading(false));
  }, []);

  // Lead stats
  const hot = allLeads.filter(l => l.motivationLevel === 'hot').length;
  const warm = allLeads.filter(l => l.motivationLevel === 'warm').length;
  const cold = allLeads.filter(l => l.motivationLevel === 'cold').length;

  // Call stats from filtered logs
  const connected = logs.filter(l =>
    l.outcome === 'connected_interested' || l.outcome === 'connected_not_interested' || l.outcome === 'callback_requested'
  ).length;
  const voicemails = logs.filter(l => l.outcome === 'voicemail').length;
  const noAnswer = logs.filter(l => l.outcome === 'no_answer' || l.outcome === 'hung_up').length;
  const connectRate = logs.length > 0 ? Math.round(connected / logs.length * 100) : 0;

  // Outcome breakdown
  const outcomeCounts: Record<string, number> = {};
  for (const l of logs) outcomeCounts[l.outcome] = (outcomeCounts[l.outcome] || 0) + 1;
  const outcomeMax = Math.max(1, ...Object.values(outcomeCounts));

  // Revenue potential
  const leadsWithARV = allLeads.filter(l => l.arv);
  const totalPotential = leadsWithARV.reduce((sum, l) => {
    const arv = Number(l.arv) || 0;
    const repairs = Number(l.estimatedRepairs) || 0;
    return sum + Math.max(0, Math.round(arv * 0.7 - repairs));
  }, 0);
  const avgAssignmentFee = leadsWithARV.length > 0 ? Math.round(totalPotential / leadsWithARV.length) : 0;

  // Campaign summary
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const totalCampaignLeads = campaigns.reduce((s, c) => s + c.leads.length, 0);
  const totalConverted = campaigns.reduce((s, c) => s + c.leads.filter(l => l.status === 'converted').length, 0);

  const pipelineMax = Math.max(1, ...Object.values(pipeline));

  const fmt = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  const fmtMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`;

  return (
    <div style={{ padding: '28px 20px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Analytics</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', fontWeight: 500 }}>Live from Supabase</p>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 15, overflow: 'hidden', background: '#111' }}>
          <img src="/maya-logo.jpg" alt="Maya" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }} />
        </div>
      </div>

      {/* Date range pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['today', '7d', '30d'] as Range[]).map(r => (
          <button key={r} onClick={() => setRange(r)} className="press-sm" style={{ padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: range === r ? C.teal : 'rgba(128,128,128,0.1)', color: range === r ? '#fff' : C.muted }}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
        {loading && <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center', fontWeight: 600 }}>Syncing…</span>}
      </div>

      {/* Lead Overview */}
      <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Lead Pipeline</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <BigStat value={allLeads.length} label="Total" color={C.blue} />
        <BigStat value={hot} label="🔥 Hot" color={C.red} />
        <BigStat value={warm} label="Warm" color={C.orange} />
        <BigStat value={cold} label="Cold" color={C.teal} />
      </div>

      {/* Revenue Potential */}
      {leadsWithARV.length > 0 && (
        <NeoTile style={{ marginBottom: 20, background: `linear-gradient(135deg, ${C.purple}18, ${C.teal}10)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <NeoIcon bg={C.purpleS} size={40} round={13}>
              <DollarSign size={18} color={C.purple} strokeWidth={2} />
            </NeoIcon>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Revenue Potential</p>
              <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>Based on {leadsWithARV.length} leads with ARV data</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 14, background: C.purpleS }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: C.purple, margin: 0, letterSpacing: '-1px' }}>{fmtMoney(totalPotential)}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total MAO Pool</p>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 14, background: C.greenS }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: C.green, margin: 0, letterSpacing: '-1px' }}>{fmtMoney(avgAssignmentFee)}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avg Assignment</p>
            </div>
          </div>
        </NeoTile>
      )}

      {/* Call Performance */}
      <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Call Performance</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <BigStat value={logs.length} label="Calls" color={C.blue} />
        <BigStat value={connected} label="Connected" color={C.green} />
        <BigStat value={voicemails} label="Voicemail" color={C.orange} />
        <BigStat value={noAnswer} label="No Answer" color={C.red} />
      </div>

      {logs.length > 0 && (
        <NeoTile style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>Connect Rate</p>
            <p style={{ fontSize: 13, fontWeight: 800, color: C.green, margin: 0 }}>{connectRate}%</p>
          </div>
          <div className="maya-progress-track" style={{ marginBottom: 16 }}>
            <div className="maya-progress-fill" style={{ width: `${connectRate}%`, background: `linear-gradient(90deg, ${C.green}, ${C.teal})` }} />
          </div>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Outcome Breakdown</p>
          {Object.entries(outcomeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([outcome, count]) => {
              const color = OUTCOME_COLORS[outcome] || C.muted;
              const pct = Math.round(count / logs.length * 100);
              return (
                <div key={outcome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS] || outcome}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} · {pct}%</span>
                  </div>
                  <div className="maya-progress-track">
                    <div className="maya-progress-fill" style={{ width: `${Math.round(count / outcomeMax * 100)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 10px' }}>Call Volume by Hour</p>
          <HourlyChart logs={logs} />
        </NeoTile>
      )}

      {/* Campaign Summary */}
      {campaigns.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Campaigns</p>
          <NeoTile style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
              <CampStat value={activeCampaigns.length} label="Active" color={C.green} />
              <CampStat value={totalCampaignLeads} label="In Drip" color={C.teal} />
              <CampStat value={totalConverted} label="Converted" color={C.purple} />
            </div>
            {campaigns.filter(c => c.leads.length > 0).slice(0, 5).map(camp => {
              const contacted = camp.leads.filter(l => l.status !== 'pending').length;
              const rate = camp.leads.length > 0 ? Math.round(contacted / camp.leads.length * 100) : 0;
              return (
                <div key={camp.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.teal, flexShrink: 0, marginLeft: 8 }}>{rate}%</span>
                  </div>
                  <div className="maya-progress-track">
                    <div className="maya-progress-fill" style={{ width: `${rate}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.blue})` }} />
                  </div>
                </div>
              );
            })}
          </NeoTile>
        </>
      )}

      {/* Pipeline Stages (Supabase) */}
      {Object.keys(pipeline).length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Pipeline Stages <span style={{ color: C.teal }}>· Supabase</span></p>
          <NeoTile style={{ marginBottom: 20 }}>
            {PIPELINE_ORDER.filter(s => pipeline[s]).map(stage => {
              const count = pipeline[stage] || 0;
              const color = PIPELINE_COLORS[stage] || C.muted;
              const pct = Math.round(count / pipelineMax * 100);
              return (
                <div key={stage} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{PIPELINE_LABELS[stage] || stage}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
                  </div>
                  <div className="maya-progress-track">
                    <div className="maya-progress-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </NeoTile>
        </>
      )}

      {/* Recent Activity */}
      {(activity.length > 0 || allLogs.length > 0) && (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Recent Activity</p>
          <NeoTile style={{ marginBottom: 20 }}>
            {(activity.length ? activity : allLogs).slice(0, 15).map((log, i) => {
              const color = OUTCOME_COLORS[log.outcome] || C.muted;
              const ago = (() => {
                const diff = Date.now() - new Date(log.createdAt).getTime();
                if (diff < 60_000) return 'just now';
                if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
                if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
                return new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })();
              return (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < 14 ? '1px solid rgba(128,128,128,0.08)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.leadName || 'Unknown'}</p>
                    <p style={{ fontSize: 12, color, margin: '1px 0 0', fontWeight: 600 }}>
                      {OUTCOME_LABELS[log.outcome] || log.outcome}
                      {log.campaignAssigned && <span style={{ color: C.muted, fontWeight: 500 }}> → {log.campaignAssigned}</span>}
                    </p>
                    {log.duration > 0 && (
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0', fontWeight: 500 }}>
                        <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                        {fmt(log.duration)}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, flexShrink: 0 }}>{ago}</span>
                </div>
              );
            })}
          </NeoTile>
        </>
      )}

      {/* Audit Trail */}
      {audit.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Audit Trail</p>
          <NeoTile style={{ marginBottom: 20 }}>
            {audit.slice(0, 20).map((entry, i) => {
              const color = AUDIT_COLORS[entry.action] || C.muted;
              const ago = (() => {
                const diff = Date.now() - new Date(entry.createdAt).getTime();
                if (diff < 60_000) return 'just now';
                if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
                if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
                return new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })();
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < Math.min(audit.length, 20) - 1 ? '1px solid rgba(128,128,128,0.08)' : 'none' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.entityName}</p>
                    <p style={{ fontSize: 12, color, margin: '1px 0 0', fontWeight: 600 }}>
                      {AUDIT_LABELS[entry.action] || entry.action}
                      <span style={{ color: C.muted, fontWeight: 500 }}> · {entry.detail}</span>
                    </p>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, flexShrink: 0 }}>{ago}</span>
                </div>
              );
            })}
          </NeoTile>
        </>
      )}

      {/* Empty state */}
      {allLeads.length === 0 && allLogs.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <NeoIcon bg={C.tealS} size={72} round={24} style={{ margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={32} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>No data yet</p>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Add leads and make calls to see analytics here</p>
        </div>
      )}
    </div>
  );
}

function BigStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 4px', borderRadius: 16, background: color + '12' }}>
      <p style={{ fontSize: 28, fontWeight: 900, color, margin: 0, lineHeight: 1, letterSpacing: '-1.5px' }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '5px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </div>
  );
}

function CampStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 14, background: color + '12' }}>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </div>
  );
}

function HourlyChart({ logs }: { logs: LeadCallLog[] }) {
  const counts: number[] = Array(24).fill(0);
  for (const l of logs) counts[new Date(l.createdAt).getHours()]++;
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8am–8pm
  const max = Math.max(1, ...hours.map(h => counts[h]));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 52, gap: 3 }}>
        {hours.map(h => {
          const c = counts[h];
          const barH = Math.max(2, Math.round((c / max) * 48));
          return (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ width: '100%', height: barH, borderRadius: '3px 3px 0 0', background: c > 0 ? `linear-gradient(180deg, ${C.teal}, ${C.blue})` : 'rgba(128,128,128,0.1)' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {hours.map(h => (
          <div key={h} style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 8, color: C.muted, fontWeight: 600 }}>
              {h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
