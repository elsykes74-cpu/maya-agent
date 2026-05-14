import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Rocket, Play, Pause, RotateCcw, BarChart3, Users, Phone, Calendar } from 'lucide-react'

export default function Campaigns() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: campaignsData, refetch } = trpc.campaigns.list.useQuery()
  const { data: profiles } = trpc.leads.profiles.useQuery()
  const { data: stats } = trpc.leads.stats.useQuery()

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => { refetch(); setDialogOpen(false) }
  })
  const activateCampaign = trpc.campaigns.activate.useMutation({
    onSuccess: (data) => { 
      refetch(); 
      alert(data.message);
    },
    onError: (err) => {
      alert(`Activation failed: ${err.message}`);
    }
  })
  const updateCampaign = trpc.campaigns.update.useMutation({ onSuccess: () => refetch() })
  const deleteCampaign = trpc.campaigns.delete.useMutation({ onSuccess: () => refetch() })
  const populateCampaign = trpc.campaigns.populate.useMutation({
    onSuccess: () => { refetch(); }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createCampaign.mutate({
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
      motivationFilter: (formData.get('motivationFilter') as any) || 'all',
      profileFilter: formData.get('profileFilter') ? Number(formData.get('profileFilter')) : undefined,
      stageFilter: (formData.get('stageFilter') as any) || 'all',
      maxCallsPerLead: Number(formData.get('maxCallsPerLead')) || 3,
      callIntervalHours: Number(formData.get('callIntervalHours')) || 48,
    })
  }

  const getStatusBadge = (status: string | null) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-500',
      active: 'bg-emerald-500',
      paused: 'bg-amber-500',
      completed: 'bg-blue-500',
      archived: 'bg-gray-500',
    }
    return <Badge className={colors[status || 'draft'] || 'bg-slate-500'}>{(status || 'draft').toUpperCase()}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-slate-500">Total leads available: {stats?.total || 0}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Rocket className="w-4 h-4 mr-2" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Calling Campaign</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input name="name" placeholder="e.g., Springfield Pre-Foreclosure Blast" required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea name="description" placeholder="What this campaign targets..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Motivation Filter</Label>
                  <Select name="motivationFilter" defaultValue="all">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="hot">HOT Only</SelectItem>
                      <SelectItem value="warm">WARM Only</SelectItem>
                      <SelectItem value="cold">COLD Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lead Profile</Label>
                  <Select name="profileFilter">
                    <SelectTrigger><SelectValue placeholder="Any profile" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {profiles?.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pipeline Stage</Label>
                  <Select name="stageFilter" defaultValue="all">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="outreach">Outreach</SelectItem>
                      <SelectItem value="scoring">Scoring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Calls Per Lead</Label>
                  <Input name="maxCallsPerLead" type="number" defaultValue={3} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Call Interval (hours)</Label>
                <Input name="callIntervalHours" type="number" defaultValue={48} />
              </div>
              <DialogFooter>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Create Campaign</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {campaignsData?.items?.length === 0 && (
          <Card>
            <CardContent className="text-center text-slate-500 py-12">
              No campaigns yet. Create your first calling campaign to start outreach.
            </CardContent>
          </Card>
        )}
        {campaignsData?.items?.map((campaign: any) => (
          <Card key={campaign.id} className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-blue-500" />
                    {campaign.name}
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">{campaign.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(campaign.status)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                  <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold">{campaign.totalLeads || 0}</p>
                  <p className="text-xs text-slate-500">Total Leads</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                  <Phone className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold">{campaign.callsCompleted || 0}</p>
                  <p className="text-xs text-slate-500">Calls Done</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                  <Calendar className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold">{campaign.appointmentsSet || 0}</p>
                  <p className="text-xs text-slate-500">Appointments</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                  <BarChart3 className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold">
                    {campaign.totalLeads > 0 ? Math.round((campaign.callsCompleted / campaign.totalLeads) * 100) : 0}%
                  </p>
                  <p className="text-xs text-slate-500">Progress</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={campaign.status === 'active' || activateCampaign.isPending}
                  onClick={() => {
                    if (confirm(`Activate campaign "${campaign.name}"? This will scrub DNC lists and start dialing ${campaign.totalLeads || 0} leads via Vapi.`)) {
                      activateCampaign.mutate({ campaignId: campaign.id });
                    }
                  }}
                >
                  <Play className="w-3 h-3 mr-1" /> {activateCampaign.isPending ? 'Activating...' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={campaign.status === 'paused'}
                  onClick={() => updateCampaign.mutate({ id: campaign.id, status: 'paused' })}
                >
                  <Pause className="w-3 h-3 mr-1" /> Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    populateCampaign.mutate({ campaignId: campaign.id })
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Populate Leads
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => {
                    if (confirm('Delete this campaign?')) deleteCampaign.mutate({ id: campaign.id })
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
