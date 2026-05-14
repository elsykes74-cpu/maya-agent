import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Radio,
  Phone,
  PhoneOff,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Ban,
  Activity
} from 'lucide-react'

export default function CallQueue() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')
  const { data: campaignsData } = trpc.campaigns.list.useQuery()
  const { data: queueData } = trpc.campaigns.callQueue.useQuery(
    selectedCampaign ? { campaignId: Number(selectedCampaign), limit: 100 } : { campaignId: 0, limit: 0 },
    { enabled: !!selectedCampaign }
  )
  const { data: stats } = selectedCampaign
    ? trpc.campaigns.stats.useQuery({ campaignId: Number(selectedCampaign) })
    : { data: null }

  const getStatusBadge = (status: string | null) => {
    const config: Record<string, { color: string; icon: any; label: string }> = {
      queued: { color: 'bg-slate-500', icon: Clock, label: 'Queued' },
      scrubbing: { color: 'bg-amber-500', icon: Shield, label: 'Scrubbing' },
      scrub_failed: { color: 'bg-red-500', icon: Ban, label: 'Scrub Failed' },
      dialing: { color: 'bg-blue-500', icon: Phone, label: 'Dialing' },
      connected: { color: 'bg-green-500', icon: Activity, label: 'Connected' },
      completed: { color: 'bg-emerald-500', icon: CheckCircle2, label: 'Completed' },
      failed: { color: 'bg-red-600', icon: XCircle, label: 'Failed' },
      cancelled: { color: 'bg-gray-500', icon: PhoneOff, label: 'Cancelled' },
    }
    const c = config[status || 'queued'] || config.queued
    const Icon = c.icon
    return <Badge className={c.color}><Icon className="w-3 h-3 mr-1" /> {c.label}</Badge>
  }

  const getOutcomeBadge = (outcome: string | null) => {
    const colors: Record<string, string> = {
      answered: 'bg-emerald-500',
      voicemail: 'bg-amber-500',
      no_answer: 'bg-slate-400',
      busy: 'bg-orange-500',
      appointment_set: 'bg-purple-500',
      not_interested: 'bg-gray-500',
      dnc: 'bg-red-600',
      failed: 'bg-red-500',
    }
    return <Badge className={colors[outcome || 'answered'] || 'bg-slate-500'}>{(outcome || 'answered').replace(/_/g, ' ').toUpperCase()}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-red-500 animate-pulse" />
          <h2 className="text-lg font-semibold">Live Call Monitor</h2>
        </div>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[360px]">
            <SelectValue placeholder="Select a campaign to monitor..." />
          </SelectTrigger>
          <SelectContent>
            {campaignsData?.items?.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name} ({c.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCampaign && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="text-xs text-slate-500 mt-1">Total Leads</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-emerald-600">{stats.completed}</p>
              <p className="text-xs text-slate-500 mt-1">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.pending}</p>
              <p className="text-xs text-slate-500 mt-1">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-600">{stats.skippedDnc + stats.skippedInvalid}</p>
              <p className="text-xs text-slate-500 mt-1">Scrubbed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-600">{stats.failed}</p>
              <p className="text-xs text-slate-500 mt-1">Failed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedCampaign && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call Queue — Live Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Scrub</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueData?.items?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                      No calls in queue yet. Activate the campaign to start dialing.
                    </TableCell>
                  </TableRow>
                )}
                {queueData?.items?.map((q: any) => (
                  <TableRow key={q.id}>
                    <TableCell>{getStatusBadge(q.status)}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{q.lead?.sellerName || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{q.lead?.propertyAddress}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{q.phone}</TableCell>
                    <TableCell>{q.callOutcome ? getOutcomeBadge(q.callOutcome) : '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{q.scrubResult || 'pending'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {q.externalCallId ? q.externalCallId.substring(0, 12) + '...' : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {q.startedAt && q.completedAt
                        ? Math.round((new Date(q.completedAt).getTime() - new Date(q.startedAt).getTime()) / 1000) + 's'
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!selectedCampaign && (
        <Card>
          <CardContent className="text-center text-slate-500 py-16">
            <Radio className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">Select a campaign to monitor live calls</p>
            <p className="text-sm mt-2">Real-time call status, scrub results, and outcomes appear here</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
