import { useState, useCallback } from 'react'
import { trpc } from '@/providers/trpc'
import {
  Target,
  MapPin,
  Copy,
  Download,
  RefreshCw,
  Flame,
  Thermometer,
  Snowflake,
  Phone,
  MessageSquare,
  Edit3,
  Zap,
  ClipboardList,
  TrendingUp,
  CheckCircle2,
  Circle,
  Building2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router'
import { C, NeoTile, NeoIcon, SectionTitle, Progress3D } from '@/components/Neo'

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  'Search for new leads in Western Massachusetts',
  'Categorize leads by type (vacant, probate, pre-foreclosure, etc.)',
  'Score each lead using the motivation model',
  'Remove duplicates from the list',
  'Prioritize hot (80+) and warm (60–79) leads for same-day action',
  'Generate call openings for top-priority leads',
  'Generate SMS openers for unreachable contacts',
  'Create CRM-ready notes for each lead',
  'Recommend next action for each lead',
  'Flag urgent opportunities (pre-foreclosure, vacant, probate)',
]

const LEAD_TYPE_LABELS: Record<string, string> = {
  vacant: 'Vacant Property',
  absentee_owner: 'Absentee Owner',
  probate: 'Probate / Estate',
  tax_delinquent: 'Tax Delinquent',
  pre_foreclosure: 'Pre-Foreclosure',
  tired_landlord: 'Tired Landlord',
  code_violation: 'Code Violation',
  expired_listing: 'Expired Listing',
  fsbo: 'FSBO',
  high_equity: 'High Equity',
  inherited: 'Inherited',
  fire_damaged: 'Fire Damaged',
  long_term_owner: 'Long-Term Owner',
  other: 'Other',
}

function scoreColor(score: number): string {
  if (score >= 80) return C.red
  if (score >= 60) return C.orange
  if (score >= 40) return C.blue
  return C.muted
}

function getPriorityLabel(score: number): string {
  if (score >= 80) return 'HOT LEAD'
  if (score >= 60) return 'WARM LEAD'
  if (score >= 40) return 'NURTURE'
  return 'LOW PRIORITY'
}

function getMotivationFlags(lead: any): string[] {
  const flags: string[] = []
  if (lead.hasTaxDelinquency) flags.push('Tax Delinquent')
  if (lead.isPreForeclosure) flags.push('Pre-Foreclosure')
  if (lead.isProbate) flags.push('Probate')
  if (lead.isVacant) flags.push('Vacant')
  if (lead.isAbsentee) flags.push('Absentee Owner')
  if (lead.hasCodeViolations) flags.push('Code Violation')
  if (lead.isExpiredListing) flags.push('Expired Listing')
  if (lead.isFsbo) flags.push('FSBO')
  if (lead.ownershipYears >= 15) flags.push(`${lead.ownershipYears}+ Yrs Ownership`)
  if (lead.isOutOfState) flags.push('Out of State')
  if (lead.isMultifamilyLandlord) flags.push('Multifamily')
  if (lead.hasVisibleDistress) flags.push('Visible Distress')
  return flags
}

// ── PropertyLeadCard ──────────────────────────────────────────────────────────

function PropertyLeadCard({ lead, onRefresh }: { lead: any; onRefresh: () => void }) {
  const score = lead.leadScore ?? 0
  const color = scoreColor(score)
  const priorityLabel = getPriorityLabel(score)
  const motivationFlags = getMotivationFlags(lead)

  const generateOutreach = trpc.leadFinder.generateOutreach.useMutation({
    onSuccess: () => {
      toast.success('Outreach generated')
      onRefresh()
    },
    onError: (e) => toast.error(e.message),
  })

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed')
    )
  }, [])

  const facts: string[] = []
  if (lead.beds) facts.push(`${lead.beds} bd`)
  if (lead.baths) facts.push(`${lead.baths} ba`)
  if (lead.squareFootage) facts.push(`${Number(lead.squareFootage).toLocaleString()} sqft`)
  if (lead.yearBuilt) facts.push(`Built ${lead.yearBuilt}`)
  if (lead.arv) facts.push(`ARV $${Number(lead.arv).toLocaleString()}`)
  if (lead.estimatedValue) facts.push(`Est. $${Number(lead.estimatedValue).toLocaleString()}`)
  if (lead.estimatedRepairs && Number(lead.estimatedRepairs) > 0) facts.push(`Repairs $${Number(lead.estimatedRepairs).toLocaleString()}`)

  return (
    <div className="maya-tile" style={{ padding: 18, marginBottom: 12 }}>
      {/* Identity row */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
          border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 14px ${color}44`,
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color }}>{score}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: color, padding: '4px 10px', borderRadius: 20, letterSpacing: '0.03em' }}>
              {score >= 80 ? '🔥' : ''}{priorityLabel}
            </span>
            {lead.leadType && lead.leadType !== 'other' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, border: `1px solid ${C.muted}55`, padding: '4px 10px', borderRadius: 20 }}>
                {LEAD_TYPE_LABELS[lead.leadType] ?? lead.leadType}
              </span>
            )}
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>{lead.sellerName}</p>
          <p style={{ fontSize: 13, color: C.muted, fontWeight: 500, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={13} /> {lead.propertyAddress}
          </p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
            {lead.city}{lead.city && lead.state ? ', ' : ''}{lead.state ?? 'MA'} {lead.zipCode ?? ''}
          </p>
          {lead.phone ? (
            <p style={{ fontSize: 13, color: C.green, fontWeight: 700, margin: '4px 0 0' }}>{lead.phone}</p>
          ) : (
            <p style={{ fontSize: 13, color: C.orange, fontWeight: 700, margin: '4px 0 0' }}>Needs skip trace.</p>
          )}
        </div>
      </div>

      {/* Facts */}
      {facts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {facts.map(f => (
            <span key={f} className="neo-pressed-sm" style={{ fontSize: 12, fontWeight: 700, color: C.sec, padding: '6px 10px', borderRadius: 10 }}>{f}</span>
          ))}
        </div>
      )}

      {/* Motivation flags */}
      {motivationFlags.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 11, color: C.muted, fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivation Indicators</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {motivationFlags.map(flag => (
              <span key={flag} style={{ fontSize: 12, fontWeight: 700, color: C.red, background: `${C.red}14`, border: `1px solid ${C.red}44`, padding: '5px 10px', borderRadius: 20 }}>{flag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Outreach angle */}
      {lead.outreachAngle && (
        <div className="neo-pressed-sm" style={{ marginTop: 12, padding: 12 }}>
          <p style={{ fontSize: 11, color: C.blue, fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} /> Outreach Angle
          </p>
          <p style={{ fontSize: 13, color: C.text, fontWeight: 500, margin: 0 }}>{lead.outreachAngle}</p>
        </div>
      )}

      {/* Call opening */}
      {lead.callOpening && (
        <div className="neo-pressed-sm" style={{ marginTop: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 11, color: C.sec, fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={13} /> Call Opening
            </p>
            <button onClick={() => copyText(lead.callOpening, 'Call opening')} className="press-sm" style={{ background: 'none', border: 'none', color: C.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Copy size={13} /> Copy
            </button>
          </div>
          <p style={{ fontSize: 13, color: C.text, fontStyle: 'italic', margin: 0 }}>"{lead.callOpening}"</p>
        </div>
      )}

      {/* SMS opener */}
      {lead.smsOpener && (
        <div className="neo-pressed-sm" style={{ marginTop: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 11, color: C.sec, fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={13} /> SMS Opener
            </p>
            <button onClick={() => copyText(lead.smsOpener, 'SMS opener')} className="press-sm" style={{ background: 'none', border: 'none', color: C.teal, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Copy size={13} /> Copy
            </button>
          </div>
          <p style={{ fontSize: 13, color: C.text, fontStyle: 'italic', margin: 0 }}>"{lead.smsOpener}"</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {!lead.callOpening && (
          <button
            onClick={() => generateOutreach.mutate({ id: lead.id })}
            disabled={generateOutreach.isPending}
            className="press-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 14, border: `1.5px solid ${C.teal}`, background: 'transparent', color: C.teal, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >
            <Zap size={14} /> {generateOutreach.isPending ? 'Generating…' : 'Generate Outreach'}
          </button>
        )}
        <Link to="/leads" style={{ textDecoration: 'none' }}>
          <span className="press-sm neo-raised-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 14, color: C.sec, fontSize: 13, fontWeight: 700 }}>
            <Edit3 size={14} /> Edit Lead
          </span>
        </Link>
        <Link to={`/calls?leadId=${lead.id}`} style={{ textDecoration: 'none' }}>
          <span className="press-sm neo-raised-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 14, color: C.sec, fontSize: 13, fontWeight: 700 }}>
            <Phone size={14} /> Log Call
          </span>
        </Link>
        <Link to={`/sms?leadId=${lead.id}`} style={{ textDecoration: 'none' }}>
          <span className="press-sm neo-raised-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 14, color: C.sec, fontSize: 13, fontWeight: 700 }}>
            <MessageSquare size={14} /> SMS
          </span>
        </Link>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const SCORE_CHIPS = [
  { v: '0', l: 'All Scores' },
  { v: '40', l: '40+' },
  { v: '60', l: '60+' },
  { v: '80', l: '80+' },
]

export default function LeadFinder() {
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('wm_workflow_steps') ?? '{}')
    } catch {
      return {}
    }
  })
  const [scoreFilter, setScoreFilter] = useState('0')
  const [typeFilter, setTypeFilter] = useState('all')

  const { data: stats, refetch: refetchStats } = trpc.leadFinder.getStats.useQuery()
  const { data: queueData, refetch: refetchQueue } = trpc.leadFinder.getPriorityQueue.useQuery({
    limit: 100,
    minScore: Number(scoreFilter),
    leadType: typeFilter,
  })

  const recomputeAll = trpc.leadFinder.recomputeAllScores.useMutation({
    onSuccess: (res) => {
      toast.success(`Re-scored ${res.updated} leads`)
      refetchStats()
      refetchQueue()
    },
    onError: (e) => toast.error(e.message),
  })

  const generateAllOutreach = trpc.leadFinder.generateAllOutreach.useMutation({
    onSuccess: (res) => {
      toast.success(`Generated outreach for ${res.generated} leads`)
      refetchQueue()
    },
    onError: (e) => toast.error(e.message),
  })

  const handleExportCSV = async () => {
    if (!queueData?.items?.length) { toast.error('No leads to export'); return }
    const items = queueData.items.map((lead: any) => ({
      first_name: lead.sellerName.split(' ')[0] ?? '',
      last_name: lead.sellerName.split(' ').slice(1).join(' ') || '',
      property_address: lead.propertyAddress,
      mailing_address: lead.ownerMailingAddress ?? lead.propertyAddress,
      phone: lead.phone ?? 'Needs skip trace.',
      email: lead.email ?? 'Needs skip trace.',
      lead_type: lead.leadType ?? 'other',
      lead_score: lead.leadScore ?? 0,
      motivation: lead.motivationLevel ?? 'cold',
      city: lead.city ?? '',
      state: lead.state ?? 'MA',
      zip: lead.zipCode ?? '',
      call_opening: lead.callOpening ?? '',
      sms_opener: lead.smsOpener ?? '',
      notes: lead.notes ?? '',
      status: lead.pipelineStage ?? 'lead',
    }))

    const headers = Object.keys(items[0]).join(',')
    const rows = items.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wm-leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${items.length} leads`)
  }

  const toggleStep = (i: number) => {
    const next = { ...checkedSteps, [i]: !checkedSteps[i] }
    setCheckedSteps(next)
    localStorage.setItem('wm_workflow_steps', JSON.stringify(next))
  }

  const completedSteps = Object.values(checkedSteps).filter(Boolean).length
  const totalLeads = (stats?.hot ?? 0) + (stats?.warm ?? 0) + (stats?.nurture ?? 0) + (stats?.low ?? 0)

  const scoreCards = [
    { key: '80', label: 'HOT LEADS', sub: 'Score 80–100 · Call same day', value: stats?.hot ?? 0, color: C.red, icon: <Flame size={16} color={C.red} /> },
    { key: '60', label: 'WARM LEADS', sub: 'Score 60–79 · Call this week', value: stats?.warm ?? 0, color: C.orange, icon: <Thermometer size={16} color={C.orange} /> },
    { key: '40', label: 'NURTURE', sub: 'Score 40–59 · Monthly drip', value: stats?.nurture ?? 0, color: C.blue, icon: <TrendingUp size={16} color={C.blue} /> },
    { key: '0', label: 'LOW PRIORITY', sub: 'Score 0–39 · Bulk mail only', value: stats?.low ?? 0, color: C.muted, icon: <Snowflake size={16} color={C.muted} /> },
  ]

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      {/* Header */}
      <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Lead Finder</h1>
      <p style={{ fontSize: 13, color: C.muted, fontWeight: 500, margin: '0 0 16px' }}>
        Score leads · Generate outreach · Work your priority queue — Western Massachusetts
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          onClick={() => recomputeAll.mutate()}
          disabled={recomputeAll.isPending}
          className="press-sm neo-raised-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 16, border: 'none', color: C.sec, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
        >
          <RefreshCw size={16} className={recomputeAll.isPending ? 'animate-spin' : ''} /> Re-Score All
        </button>
        <button
          onClick={() => generateAllOutreach.mutate()}
          disabled={generateAllOutreach.isPending}
          className="press-sm neo-raised-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 16, border: 'none', color: C.sec, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
        >
          <Zap size={16} /> {generateAllOutreach.isPending ? 'Generating…' : 'Generate All Outreach'}
        </button>
        <button
          onClick={handleExportCSV}
          className="press-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 16, border: 'none', background: `linear-gradient(135deg, ${C.green}, #28A745)`, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
        >
          <Download size={16} /> Export CRM CSV
        </button>
      </div>

      {/* Score cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
        {scoreCards.map(c => (
          <button
            key={c.key}
            onClick={() => setScoreFilter(c.key)}
            className="maya-tile press-sm"
            aria-pressed={scoreFilter === c.key}
            style={{
              border: 'none', cursor: 'pointer', padding: '16px', textAlign: 'left',
              borderLeft: `4px solid ${c.color}`,
              outline: scoreFilter === c.key ? `2px solid ${c.color}` : 'none',
            }}
          >
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 8px', fontWeight: 700, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              {c.icon} {c.label}
            </p>
            <p style={{ fontSize: 32, fontWeight: 900, color: c.color, margin: 0, lineHeight: 1 }}>{c.value}</p>
            <p style={{ fontSize: 11, color: C.muted, fontWeight: 500, margin: '6px 0 0' }}>{c.sub}</p>
          </button>
        ))}
      </div>

      {/* Lead Type Breakdown */}
      <SectionTitle icon={<Building2 size={14} color={C.teal} />}>Lead Type Breakdown</SectionTitle>
      <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
        {(stats?.byType?.length ?? 0) === 0 && (
          <p style={{ fontSize: 14, color: C.muted, fontWeight: 600, textAlign: 'center', padding: '16px 0', margin: 0 }}>
            No leads scored yet. Tap "Re-Score All" to begin.
          </p>
        )}
        {stats?.byType?.filter((t: any) => t.type && Number(t.count) > 0).map((t: any) => {
          const pct = totalLeads > 0 ? Math.round((Number(t.count) / totalLeads) * 100) : 0
          const active = typeFilter === t.type
          return (
            <button
              key={t.type}
              onClick={() => setTypeFilter(active ? 'all' : (t.type ?? 'all'))}
              className="press-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 0', textAlign: 'left' }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: active ? C.teal : C.text, width: 128, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {LEAD_TYPE_LABELS[t.type ?? ''] ?? t.type}
              </span>
              <span style={{ flex: 1 }}><Progress3D value={pct} bg={C.teal} /></span>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.text, width: 36, textAlign: 'right' }}>{t.count}</span>
            </button>
          )
        })}
      </NeoTile>

      {/* Daily Bot Workflow */}
      <SectionTitle icon={<ClipboardList size={14} color={C.teal} />}>Daily Bot Workflow</SectionTitle>
      <NeoTile style={{ padding: '18px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{completedSteps}/{WORKFLOW_STEPS.length} done</span>
        </div>
        <div style={{ marginBottom: 12 }}><Progress3D value={Math.round((completedSteps / WORKFLOW_STEPS.length) * 100)} bg={C.teal} /></div>
        {WORKFLOW_STEPS.map((step, i) => (
          <button
            key={i}
            onClick={() => toggleStep(i)}
            className="press-sm"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 0', textAlign: 'left' }}
          >
            <span style={{ marginTop: 1, flexShrink: 0 }}>
              {checkedSteps[i]
                ? <CheckCircle2 size={18} color={C.teal} />
                : <Circle size={18} color={C.muted} />}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 500,
              color: checkedSteps[i] ? C.muted : C.text,
              textDecoration: checkedSteps[i] ? 'line-through' : 'none',
            }}>
              {i + 1}. {step}
            </span>
          </button>
        ))}
        <button
          onClick={() => { setCheckedSteps({}); localStorage.removeItem('wm_workflow_steps') }}
          className="press-sm"
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginTop: 10, padding: 0 }}
        >
          Reset checklist
        </button>
      </NeoTile>

      {/* Priority Queue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle icon={<Target size={14} color={C.teal} />}>Priority Queue</SectionTitle>
        <span style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 14 }}>({queueData?.total ?? 0} leads)</span>
      </div>

      {/* Score filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 10 }} className="hide-scrollbar">
        {SCORE_CHIPS.map(c => (
          <button key={c.v} onClick={() => setScoreFilter(c.v)}
            className={`${scoreFilter === c.v ? 'neo-pressed' : 'neo-raised-sm'} press-sm`}
            aria-pressed={scoreFilter === c.v}
            style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', color: scoreFilter === c.v ? C.teal : C.muted, borderRadius: 16 }}>
            {c.l}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }} className="hide-scrollbar">
        <button onClick={() => setTypeFilter('all')}
          className={`${typeFilter === 'all' ? 'neo-pressed' : 'neo-raised-sm'} press-sm`}
          aria-pressed={typeFilter === 'all'}
          style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', color: typeFilter === 'all' ? C.teal : C.muted, borderRadius: 16 }}>
          All Types
        </button>
        {Object.entries(LEAD_TYPE_LABELS).map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            className={`${typeFilter === val ? 'neo-pressed' : 'neo-raised-sm'} press-sm`}
            aria-pressed={typeFilter === val}
            style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', color: typeFilter === val ? C.teal : C.muted, borderRadius: 16 }}>
            {label}
          </button>
        ))}
      </div>

      {!(queueData?.items?.length) && (
        <NeoTile style={{ padding: '40px 24px', textAlign: 'center', marginBottom: 16 }}>
          <NeoIcon bg={C.surface} size={56}><Users size={24} color={C.muted} /></NeoIcon>
          <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '12px 0 4px' }}>No leads in this queue</p>
          <p style={{ fontSize: 13, color: C.muted, fontWeight: 500, margin: 0 }}>
            Add leads via <Link to="/leads" style={{ color: C.teal, fontWeight: 700 }}>the Leads page</Link>, then tap Re-Score All.
          </p>
        </NeoTile>
      )}
      {(queueData?.items ?? []).map((lead: any) => (
        <PropertyLeadCard
          key={lead.id}
          lead={lead}
          onRefresh={() => { refetchStats(); refetchQueue() }}
        />
      ))}

      <div style={{ height: 20 }} />
    </div>
  )
}
