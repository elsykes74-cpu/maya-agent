import { useState, useCallback } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'

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

function getScoreColor(score: number) {
  if (score >= 80) return 'text-red-600 bg-red-50 border-red-200'
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200'
  if (score >= 40) return 'text-blue-600 bg-blue-50 border-blue-200'
  return 'text-slate-500 bg-slate-50 border-slate-200'
}

function getPriorityLabel(score: number) {
  if (score >= 80) return { label: 'HOT LEAD', color: 'bg-red-500' }
  if (score >= 60) return { label: 'WARM LEAD', color: 'bg-amber-500' }
  if (score >= 40) return { label: 'NURTURE LEAD', color: 'bg-blue-500' }
  return { label: 'LOW PRIORITY', color: 'bg-slate-400' }
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
  const { label: priorityLabel, color: priorityColor } = getPriorityLabel(lead.leadScore ?? 0)
  const scoreColor = getScoreColor(lead.leadScore ?? 0)
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

  return (
    <Card className="border border-slate-200 dark:border-slate-700">
      <CardContent className="p-5">
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Left: Score + Identity */}
          <div className="flex gap-4 lg:w-72 shrink-0">
            {/* Score Circle */}
            <div
              className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shrink-0 font-bold text-xl ${scoreColor}`}
            >
              {lead.leadScore ?? 0}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={`${priorityColor} text-white text-xs`}>{priorityLabel}</Badge>
                {lead.leadType && lead.leadType !== 'other' && (
                  <Badge variant="outline" className="text-xs">
                    {LEAD_TYPE_LABELS[lead.leadType] ?? lead.leadType}
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{lead.sellerName}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {lead.propertyAddress}
              </p>
              <p className="text-xs text-slate-400">
                {lead.city}{lead.city && lead.state ? ', ' : ''}{lead.state ?? 'MA'} {lead.zipCode ?? ''}
              </p>
              {lead.phone ? (
                <p className="text-xs text-emerald-600 mt-1">{lead.phone}</p>
              ) : (
                <p className="text-xs text-amber-500 mt-1">Needs skip trace.</p>
              )}
              {lead.county && (
                <p className="text-xs text-slate-400">{lead.county} County</p>
              )}
            </div>
          </div>

          {/* Right: Details */}
          <div className="flex-1 space-y-3">
            {/* Property Details Row */}
            <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
              {lead.beds && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{lead.beds} bd</span>}
              {lead.baths && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{lead.baths} ba</span>}
              {lead.squareFootage && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{lead.squareFootage.toLocaleString()} sqft</span>}
              {lead.yearBuilt && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Built {lead.yearBuilt}</span>}
              {lead.arv && <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 px-2 py-0.5 rounded">ARV ${Number(lead.arv).toLocaleString()}</span>}
              {lead.estimatedValue && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Est. Value ${Number(lead.estimatedValue).toLocaleString()}</span>}
              {lead.estimatedRepairs && Number(lead.estimatedRepairs) > 0 && (
                <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 px-2 py-0.5 rounded">
                  Repairs ${Number(lead.estimatedRepairs).toLocaleString()}
                </span>
              )}
            </div>

            {/* Motivation Flags */}
            {motivationFlags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Motivation Indicators</p>
                <div className="flex flex-wrap gap-1.5">
                  {motivationFlags.map((flag) => (
                    <span
                      key={flag}
                      className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full dark:bg-red-900/20 dark:text-red-400"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Outreach Angle */}
            {lead.outreachAngle && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Outreach Angle
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">{lead.outreachAngle}</p>
              </div>
            )}

            {/* Call Opening */}
            {lead.callOpening && (
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Call Opening
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => copyText(lead.callOpening, 'Call opening')}
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 italic">"{lead.callOpening}"</p>
              </div>
            )}

            {/* SMS Opener */}
            {lead.smsOpener && (
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> SMS Opener
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => copyText(lead.smsOpener, 'SMS opener')}
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 italic">"{lead.smsOpener}"</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {!lead.callOpening && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => generateOutreach.mutate({ id: lead.id })}
                  disabled={generateOutreach.isPending}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  {generateOutreach.isPending ? 'Generating…' : 'Generate Outreach'}
                </Button>
              )}
              <Link to={`/leads`}>
                <Button size="sm" variant="outline" className="text-xs">
                  <Edit3 className="w-3 h-3 mr-1" /> Edit Lead
                </Button>
              </Link>
              <Link to={`/calls?leadId=${lead.id}`}>
                <Button size="sm" variant="outline" className="text-xs">
                  <Phone className="w-3 h-3 mr-1" /> Log Call
                </Button>
              </Link>
              <Link to={`/sms?leadId=${lead.id}`}>
                <Button size="sm" variant="outline" className="text-xs">
                  <MessageSquare className="w-3 h-3 mr-1" /> SMS
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
    const items = queueData.items.map((lead) => ({
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 mt-0.5">
            Score leads · Generate outreach · Work your priority queue — Western Massachusetts
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeAll.mutate()}
            disabled={recomputeAll.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recomputeAll.isPending ? 'animate-spin' : ''}`} />
            Re-Score All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateAllOutreach.mutate()}
            disabled={generateAllOutreach.isPending}
          >
            <Zap className="w-4 h-4 mr-2" />
            {generateAllOutreach.isPending ? 'Generating…' : 'Generate All Outreach'}
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CRM CSV
          </Button>
        </div>
      </div>

      {/* Score Range Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="border-l-4 border-l-red-500 cursor-pointer hover:bg-red-50/50 dark:hover:bg-red-900/10"
          onClick={() => setScoreFilter('80')}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-500" /> HOT LEADS
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-red-600">{stats?.hot ?? 0}</div>
            <p className="text-xs text-slate-400 mt-1">Score 80–100 · Call same day</p>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-amber-500 cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-900/10"
          onClick={() => setScoreFilter('60')}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-500" /> WARM LEADS
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-amber-600">{stats?.warm ?? 0}</div>
            <p className="text-xs text-slate-400 mt-1">Score 60–79 · Call this week</p>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-blue-500 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
          onClick={() => setScoreFilter('40')}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> NURTURE
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-blue-600">{stats?.nurture ?? 0}</div>
            <p className="text-xs text-slate-400 mt-1">Score 40–59 · Monthly drip</p>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
          onClick={() => setScoreFilter('0')}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-slate-500 flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-slate-400" /> LOW PRIORITY
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold text-slate-500">{stats?.low ?? 0}</div>
            <p className="text-xs text-slate-400 mt-1">Score 0–39 · Bulk mail only</p>
          </CardContent>
        </Card>
      </div>

      {/* Type Breakdown + Workflow Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Type Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" /> Lead Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byType?.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">No leads scored yet. Click "Re-Score All" to begin.</p>
            )}
            <div className="space-y-2">
              {stats?.byType?.filter((t) => t.type && Number(t.count) > 0).map((t) => {
                const pct = totalLeads > 0 ? Math.round((Number(t.count) / totalLeads) * 100) : 0
                return (
                  <div key={t.type} className="flex items-center gap-3">
                    <div
                      className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate cursor-pointer hover:text-emerald-600"
                      style={{ width: '140px' }}
                      onClick={() => setTypeFilter(t.type ?? 'all')}
                    >
                      {LEAD_TYPE_LABELS[t.type ?? ''] ?? t.type}
                    </div>
                    <div className="flex-1">
                      <Progress value={pct} className="h-2" />
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white w-8 text-right">
                      {t.count}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Daily Workflow Checklist */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" /> Daily Bot Workflow
              </CardTitle>
              <span className="text-xs text-slate-500">
                {completedSteps}/{WORKFLOW_STEPS.length} done
              </span>
            </div>
            <Progress value={(completedSteps / WORKFLOW_STEPS.length) * 100} className="h-1.5 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {WORKFLOW_STEPS.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => toggleStep(i)}
                >
                  <div className="mt-0.5 shrink-0">
                    {checkedSteps[i] ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 transition-colors" />
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      checkedSteps[i]
                        ? 'line-through text-slate-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {i + 1}. {step}
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 text-xs text-slate-400"
              onClick={() => {
                setCheckedSteps({})
                localStorage.removeItem('wm_workflow_steps')
              }}
            >
              Reset checklist
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Priority Queue */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" /> Priority Queue
              <span className="text-sm font-normal text-slate-500 ml-1">
                ({queueData?.total ?? 0} leads)
              </span>
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Min score" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">All Scores</SelectItem>
                  <SelectItem value="40">Nurture+ (40+)</SelectItem>
                  <SelectItem value="60">Warm+ (60+)</SelectItem>
                  <SelectItem value="80">HOT Only (80+)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Lead Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(LEAD_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {!queueData?.items?.length && (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No leads in this queue</p>
              <p className="text-sm mt-1">
                Add leads via{' '}
                <Link to="/leads" className="text-emerald-600 underline">
                  the Leads page
                </Link>
                , then click Re-Score All.
              </p>
            </div>
          )}
          {queueData?.items?.map((lead) => (
            <PropertyLeadCard
              key={lead.id}
              lead={lead}
              onRefresh={() => { refetchStats(); refetchQueue() }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
