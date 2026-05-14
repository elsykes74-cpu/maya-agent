import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Flame,
  Thermometer,
  Snowflake,
  Phone,
  CalendarCheck,
  TrendingUp,
  ArrowRight,
  DollarSign,
  CheckCircle2
} from 'lucide-react'
import { Link } from 'react-router'

export default function Home() {
  const { data: stats, isLoading: statsLoading } = trpc.leads.stats.useQuery()
  const { data: callStats } = trpc.calls.stats.useQuery()
  const { data: apptStats } = trpc.appointments.stats.useQuery()
  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 5, motivation: 'hot' })

  const pipelineStages = [
    { stage: 'lead', label: 'Lead Source', color: 'bg-slate-500' },
    { stage: 'outreach', label: 'Outreach', color: 'bg-blue-500' },
    { stage: 'scoring', label: 'Scoring', color: 'bg-indigo-500' },
    { stage: 'hot_routing', label: 'Hot Routing', color: 'bg-red-500' },
    { stage: 'warm_nurture', label: 'Warm Nurture', color: 'bg-amber-500' },
    { stage: 'cold_drip', label: 'Cold Drip', color: 'bg-cyan-500' },
    { stage: 'appointment', label: 'Appointment', color: 'bg-emerald-500' },
    { stage: 'close', label: 'Close', color: 'bg-green-600' },
  ]

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="h-32 bg-slate-200 dark:bg-slate-800 rounded" /></Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-500" /> HOT Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.hot || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Motivated, timeline &lt;30 days</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-500" /> WARM Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.warm || 0}</div>
            <p className="text-xs text-slate-500 mt-1">1-6 month timeline</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Snowflake className="w-4 h-4 text-cyan-500" /> COLD Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.cold || 0}</div>
            <p className="text-xs text-slate-500 mt-1">No urgency, retail expectations</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-emerald-500" /> Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.appointments || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Walkthroughs scheduled</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Pipeline Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pipelineStages.map((stage) => {
              const count = stats?.byStage?.find((s: { stage: string | null; count: number }) => s.stage === stage.stage)?.count || 0
              const total = stats?.total || 1
              const pct = Math.round((count / total) * 100)
              return (
                <div key={stage.stage} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-medium text-slate-700 dark:text-slate-300">{stage.label}</div>
                  <div className="flex-1">
                    <Progress value={pct} className="h-2" />
                  </div>
                  <div className="w-16 text-right text-sm font-semibold text-slate-900 dark:text-white">{count}</div>
                  <div className="w-12 text-right text-xs text-slate-500">{pct}%</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-500" />
              HOT Leads — Erick Calls Same Day
            </CardTitle>
            <Link to="/leads?motivation=hot">
              <Button variant="ghost" size="sm" className="text-emerald-600">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leadsData?.items?.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No hot leads yet. Import leads to get started.</p>
              )}
              {leadsData?.items?.map((lead: { id: number; sellerName: string; propertyAddress: string; timeline: string | null; askingPrice: string | null; phone: string | null }) => (
                <div key={lead.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-slate-900 dark:text-white">{lead.sellerName}</p>
                    <p className="text-xs text-slate-500">{lead.propertyAddress}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">HOT</span>
                      {lead.timeline && <span className="text-xs text-slate-500">{lead.timeline}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {lead.askingPrice && (
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        ${Number(lead.askingPrice).toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">{lead.phone}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Call Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{callStats?.total || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Total Calls</p>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">{callStats?.answered || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Answered</p>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">{callStats?.voicemail || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Voicemails</p>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">{callStats?.appointments || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Appts Set</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Deal Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Scheduled</span>
                  </div>
                  <span className="text-sm font-semibold">{apptStats?.scheduled || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Completed</span>
                  </div>
                  <span className="text-sm font-semibold">{apptStats?.completed || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Contracts Signed</span>
                  </div>
                  <span className="text-sm font-semibold">{apptStats?.contracts || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
