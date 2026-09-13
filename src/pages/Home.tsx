import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  PhoneCall, Users, CalendarCheck, Flame, TrendingUp, ShieldCheck,
  MessageSquare, Bot, Settings as SettingsIcon, RefreshCw, Radio, Database,
} from 'lucide-react';
import { C, NeoTile, NeoIcon, SectionTitle, NeoToggle, Progress3D, StatPill } from '@/components/Neo';
import { trpc } from '@/providers/trpc';

type Tab = 'overview' | 'controls';

const STAGE_ORDER = ['lead', 'cold_drip', 'warm_nurture', 'hot_routing'] as const;
const STAGE_LABELS: Record<string, string> = {
  lead: 'New',
  cold_drip: 'Cold Drip',
  warm_nurture: 'Warm Nurture',
  hot_routing: 'Hot Routing',
};
const STAGE_COLORS: Record<string, string> = {
  lead: C.blue,
  cold_drip: C.muted,
  warm_nurture: C.orange,
  hot_routing: C.red,
};

function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function prettifySource(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const s = raw.toLowerCase();
  if (s === 'fsbo') return 'Craigslist FSBO';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  const statsQ = trpc.leads.stats.useQuery();
  const callsQ = trpc.calls.stats.useQuery();
  const runQ = trpc.scraper.latest.useQuery();
  const leadsQ = trpc.leads.list.useQuery({ limit: 500 });
  const cfgQ = trpc.callingConfig.get.useQuery();
  const utils = trpc.useUtils();

  const updateCfg = trpc.callingConfig.update.useMutation({
    onSuccess: () => cfgQ.refetch(),
  });

  const refresh = () => {
    statsQ.refetch(); callsQ.refetch(); runQ.refetch(); leadsQ.refetch(); cfgQ.refetch();
    utils.leads.stats.invalidate(); utils.calls.stats.invalidate();
  };

  const stats = statsQ.data;
  const callStats = callsQ.data;
  const run = runQ.data;
  const cfg = cfgQ.data;
  const items = leadsQ.data?.items ?? [];

  const loading = statsQ.isLoading || callsQ.isLoading || runQ.isLoading || leadsQ.isLoading;
  const failed = statsQ.isError || callsQ.isError || runQ.isError || leadsQ.isError;

  // Phone coverage
  const withPhone = items.filter(l => (l.phone ?? '').trim().length > 0).length;
  const phonePct = items.length > 0 ? Math.round((withPhone / items.length) * 100) : 0;

  // Source mix
  const sourceCounts = new Map<string, number>();
  for (const l of items) {
    const key = prettifySource((l as { leadType?: string }).leadType);
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const sources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSource = sources[0]?.[1] ?? 1;

  // Pipeline funnel
  const byStage = new Map<string, number>();
  for (const s of stats?.byStage ?? []) byStage.set(s.stage ?? 'lead', Number(s.count) ?? 0);
  const funnel = STAGE_ORDER.map(k => ({ key: k, label: STAGE_LABELS[k], count: byStage.get(k) ?? 0 }));
  const maxStage = Math.max(1, ...funnel.map(f => f.count));

  // Call outcomes
  const totalCalls = callStats?.total ?? 0;
  const answerRate = totalCalls > 0 ? Math.round(((callStats?.answered ?? 0) / totalCalls) * 100) : 0;

  const runOk = run?.status === 'ok' && !run?.error;

  const setToggle = (key: 'voicemailEnabled' | 'smsFollowUpEnabled' | 'scrubDncBeforeCall' | 'scrubLitigants', v: boolean) => {
    if (!cfg) return;
    updateCfg.mutate({ id: cfg.id, [key]: v } as { id: number } & Record<string, boolean>);
  };

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Dashboard</h1>
        <button onClick={refresh} className="press-sm" aria-label="Refresh dashboard" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <NeoIcon bg={C.bg} size={48}><RefreshCw size={20} color={C.muted} strokeWidth={2.5} /></NeoIcon>
        </button>
      </div>

      {/* Segmented control */}
      <div className="neo-pressed-sm" style={{ display: 'flex', padding: 4, borderRadius: 18, marginBottom: 20 }}>
        {(['overview', 'controls'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className="press-sm"
            style={{
              flex: 1, padding: '10px 0', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer',
              borderRadius: 14, color: tab === t ? C.teal : C.muted,
              background: tab === t ? C.tealS : 'transparent',
            }}
          >
            {t === 'overview' ? 'Overview' : 'Controls'}
          </button>
        ))}
      </div>

      {loading && (
        <NeoTile style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: C.muted, fontWeight: 600, margin: 0 }}>Loading live numbers…</p>
        </NeoTile>
      )}

      {failed && !loading && (
        <NeoTile style={{ padding: 24, textAlign: 'center', marginBottom: 16 }}>
          <p style={{ color: C.red, fontWeight: 700, margin: '0 0 12px' }}>Couldn't load dashboard data.</p>
          <button onClick={refresh} className="press-sm" style={{ padding: '10px 22px', borderRadius: 14, border: 'none', background: C.teal, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </NeoTile>
      )}

      {!loading && !failed && tab === 'overview' && (
        <>
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            <KpiButton value={stats?.hot ?? 0} label="Hot" accentColor="#FF6B6B" darkColor="#FF3B30" onClick={() => navigate('/leads')} />
            <KpiButton value={totalCalls} label="Calls" accentColor="#2DD4BF" darkColor="#0D9488" onClick={() => navigate('/calls')} />
            <KpiButton value={stats?.total ?? 0} label="Leads" accentColor="#FFB340" darkColor="#FF9500" onClick={() => navigate('/leads')} />
            <KpiButton value={stats?.appointments ?? 0} label="Appts" accentColor="#A78BFA" darkColor="#7C3AED" onClick={() => navigate('/appointments')} />
          </div>

          {/* Pipeline funnel */}
          <SectionTitle icon={<TrendingUp size={14} color={C.teal} />}>Pipeline</SectionTitle>
          <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
            {funnel.map(f => (
              <button key={f.key} onClick={() => navigate('/leads')} className="press-sm" style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{f.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: STAGE_COLORS[f.key] }}>{f.count}</span>
                </div>
                <Progress3D value={Math.round((f.count / maxStage) * 100)} bg={STAGE_COLORS[f.key]} />
              </button>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Appointments set</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>{stats?.appointments ?? 0}</span>
            </div>
          </NeoTile>

          {/* Lead sources */}
          <SectionTitle icon={<Database size={14} color={C.blue} />}>Lead Sources</SectionTitle>
          <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
            {sources.length === 0 && <p style={{ color: C.muted, fontWeight: 600, margin: 0 }}>No leads yet.</p>}
            {sources.map(([name, count]) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{name}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.blue }}>{count}</span>
                </div>
                <Progress3D value={Math.round((count / maxSource) * 100)} bg={C.blue} />
              </div>
            ))}
          </NeoTile>

          {/* Call outcomes */}
          <SectionTitle icon={<PhoneCall size={14} color={C.green} />}>Call Outcomes</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
            <StatPill icon={<PhoneCall size={20} color={C.green} />} value={callStats?.answered ?? 0} label="Answered" bg={C.greenS} />
            <StatPill icon={<MessageSquare size={20} color={C.orange} />} value={callStats?.voicemail ?? 0} label="Voicemail" bg={C.orangeS} />
            <StatPill icon={<CalendarCheck size={20} color={C.purple} />} value={callStats?.appointments ?? 0} label="Appts Set" bg={C.purpleS} />
          </div>
          <NeoTile style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Answer rate</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: C.green }}>{answerRate}%</span>
          </NeoTile>

          {/* Phone coverage */}
          <SectionTitle icon={<Users size={14} color={C.orange} />}>Phone Coverage</SectionTitle>
          <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Leads with a phone number</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{withPhone} <span style={{ color: C.muted, fontWeight: 600 }}>/ {items.length}</span></span>
            </div>
            <Progress3D value={phonePct} bg={C.orange} />
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '8px 0 0' }}>
              {items.length - withPhone} still waiting on skip tracing
            </p>
          </NeoTile>

          {/* Scan health */}
          <SectionTitle icon={<Radio size={14} color={C.teal} />}>Scan Health</SectionTitle>
          <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: runOk ? C.green : C.red, boxShadow: `0 0 8px ${runOk ? C.green : C.red}` }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Craigslist scan · every 30 min</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, margin: 0 }}>
              Last run {runOk ? 'ok' : 'had an issue'} · {run?.found ?? 0} found · {run?.added ?? 0} added · {timeAgo(run?.finishedAt ?? run?.startedAt)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.teal }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>RentCast scan · Mondays 9:35 AM</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, margin: 0 }}>Next run Monday morning</p>
          </NeoTile>
        </>
      )}

      {!loading && !failed && tab === 'controls' && (
        <>
          {/* Call engine toggles */}
          <SectionTitle icon={<PhoneCall size={14} color={C.green} />}>Call Engine</SectionTitle>
          <NeoTile style={{ padding: '8px 20px', marginBottom: 24 }}>
            <ToggleRow
              label="Voicemail detection"
              desc="Detect voicemail and leave a message"
              value={cfg?.voicemailEnabled ?? false}
              disabled={!cfg || updateCfg.isPending}
              onChange={v => setToggle('voicemailEnabled', v)}
            />
            <ToggleRow
              label="SMS follow-up"
              desc="Text sellers after calls and voicemails"
              value={cfg?.smsFollowUpEnabled ?? false}
              disabled={!cfg || updateCfg.isPending}
              onChange={v => setToggle('smsFollowUpEnabled', v)}
            />
            <ToggleRow
              label="DNC scrub"
              desc="Skip numbers on do-not-call lists"
              value={cfg?.scrubDncBeforeCall ?? false}
              disabled={!cfg || updateCfg.isPending}
              onChange={v => setToggle('scrubDncBeforeCall', v)}
            />
            <ToggleRow
              label="Litigant scrub"
              desc="Skip known litigants before dialing"
              value={cfg?.scrubLitigants ?? false}
              disabled={!cfg || updateCfg.isPending}
              onChange={v => setToggle('scrubLitigants', v)}
              last
            />
          </NeoTile>

          <NeoTile style={{ padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: 0 }}>Calling hours</p>
                <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, margin: '4px 0 0' }}>
                  {cfg?.callWindowStart ?? '09:00'} – {cfg?.callWindowEnd ?? '19:00'} · {cfg?.maxDailyCalls ?? 100} calls/day · {(cfg?.provider ?? 'vapi').toUpperCase()}
                </p>
              </div>
              <button onClick={() => navigate('/ai-config')} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.teal, cursor: 'pointer' }}>Edit</button>
            </div>
          </NeoTile>

          {/* Configure */}
          <SectionTitle icon={<SettingsIcon size={14} color={C.muted} />}>Configure</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
            <ControlCard icon={<Bot size={20} color={C.orange} />} bg={C.orangeS} label="AI Agent" desc="Voice, script & keys" onClick={() => navigate('/ai-config')} />
            <ControlCard icon={<ShieldCheck size={20} color={C.red} />} bg={C.redS} label="DNC Lists" desc="Blocked numbers" onClick={() => navigate('/dnc')} />
            <ControlCard icon={<MessageSquare size={20} color={C.blue} />} bg={C.blueS} label="SMS Sequences" desc="Text templates" onClick={() => navigate('/sms')} />
            <ControlCard icon={<Flame size={14} color={C.red} />} bg={C.surface} label="Campaigns" desc="Outreach & stats" onClick={() => navigate('/campaigns')} />
          </div>
          <button onClick={() => navigate('/settings')} className="maya-tile press-sm" style={{ width: '100%', padding: 18, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', marginBottom: 24 }}>
            <NeoIcon bg={C.surface} size={44}><SettingsIcon size={20} color={C.muted} /></NeoIcon>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>All Settings</p>
              <p style={{ fontSize: 13, color: C.muted, fontWeight: 500, margin: '2px 0 0' }}>Account & preferences</p>
            </div>
          </button>
        </>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

function ToggleRow({ label, desc, value, disabled, onChange, last }: {
  label: string; desc: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.05)', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: C.muted, fontWeight: 500, margin: '3px 0 0' }}>{desc}</p>
      </div>
      <NeoToggle value={value} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function ControlCard({ icon, bg, label, desc, onClick }: {
  icon: React.ReactNode; bg: string; label: string; desc: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="maya-tile press-sm" style={{ border: 'none', cursor: 'pointer', padding: 16, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
      <NeoIcon bg={bg} size={44}>{icon}</NeoIcon>
      <div>
        <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: C.muted, fontWeight: 500, margin: '2px 0 0' }}>{desc}</p>
      </div>
    </button>
  );
}

function KpiButton({ value, label, onClick, accentColor = '#14B8A6', darkColor = '' }: { value: number; label: string; onClick?: () => void; accentColor?: string; darkColor?: string }) {
  const endColor = darkColor || accentColor;
  return (
    <button
      onClick={onClick}
      className="maya-tile press-sm"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 12px', gap: 8, border: 'none', cursor: 'pointer', height: 104, borderRadius: 22 }}
    >
      <p style={{ fontSize: 10, color: C.muted, margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: `linear-gradient(145deg, ${accentColor} 0%, ${endColor} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 22px ${accentColor}55, 0 2px 6px ${accentColor}33, inset 0 1px 0 rgba(255,255,255,0.35)`, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 36% 28%, rgba(255,255,255,0.48) 0%, transparent 58%)', pointerEvents: 'none' }} />
        <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px', position: 'relative' }}>{value}</span>
      </div>
    </button>
  );
}
