import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  Plus,
  Flame,
  Thermometer,
  Snowflake,
  Phone,
  MessageSquare,
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit3,
  Eye
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Link } from 'react-router'

export default function Leads() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [motivationFilter, setMotivationFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<any>(null)
  const [detailLead, setDetailLead] = useState<any>(null)

  const { data: leadsData, refetch } = trpc.leads.list.useQuery({
    search: search || undefined,
    stage: stageFilter,
    motivation: motivationFilter,
    limit: 50,
  })

  const { data: sources } = trpc.leads.sources.useQuery()
  const { data: profiles } = trpc.leads.profiles.useQuery()

  const createLead = trpc.leads.create.useMutation({ onSuccess: () => { refetch(); setDialogOpen(false) } })
  const updateLead = trpc.leads.update.useMutation({ onSuccess: () => { refetch(); setDialogOpen(false); setEditingLead(null) } })
  const deleteLead = trpc.leads.delete.useMutation({ onSuccess: () => refetch() })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data: any = {
      sellerName: formData.get('sellerName') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string || undefined,
      propertyAddress: formData.get('propertyAddress') as string,
      city: formData.get('city') as string,
      zipCode: formData.get('zipCode') as string,
      motivationLevel: formData.get('motivationLevel') as any,
      timeline: formData.get('timeline') as string,
      occupancyStatus: formData.get('occupancyStatus') as any || undefined,
      condition: formData.get('condition') as any || undefined,
      estimatedRepairs: formData.get('estimatedRepairs') as string || undefined,
      beds: formData.get('beds') ? Number(formData.get('beds')) : undefined,
      baths: formData.get('baths') as string || undefined,
      squareFootage: formData.get('squareFootage') ? Number(formData.get('squareFootage')) : undefined,
      askingPrice: formData.get('askingPrice') as string || undefined,
      arv: formData.get('arv') as string || undefined,
      mao: formData.get('mao') as string || undefined,
      notes: formData.get('notes') as string || undefined,
      pipelineStage: formData.get('pipelineStage') as any || 'lead',
      sourceId: formData.get('sourceId') ? Number(formData.get('sourceId')) : undefined,
      profileId: formData.get('profileId') ? Number(formData.get('profileId')) : undefined,
    }

    if (editingLead) {
      updateLead.mutate({ ...data, id: editingLead.id })
    } else {
      createLead.mutate(data)
    }
  }

  const openEdit = (lead: any) => {
    setEditingLead(lead)
    setDialogOpen(true)
  }

  const openNew = () => {
    setEditingLead(null)
    setDialogOpen(true)
  }

  const getMotivationBadge = (level: string | null) => {
    switch (level) {
      case 'hot': return <Badge className="bg-red-500"><Flame className="w-3 h-3 mr-1" /> HOT</Badge>
      case 'warm': return <Badge className="bg-amber-500"><Thermometer className="w-3 h-3 mr-1" /> WARM</Badge>
      case 'cold': return <Badge className="bg-cyan-500"><Snowflake className="w-3 h-3 mr-1" /> COLD</Badge>
      default: return <Badge variant="secondary">Unknown</Badge>
    }
  }

  const getStageBadge = (stage: string | null) => {
    const colors: Record<string, string> = {
      lead: 'bg-slate-500',
      outreach: 'bg-blue-500',
      scoring: 'bg-indigo-500',
      hot_routing: 'bg-red-500',
      warm_nurture: 'bg-amber-500',
      cold_drip: 'bg-cyan-500',
      appointment: 'bg-emerald-500',
      close: 'bg-green-600',
    }
    return <Badge className={colors[stage || 'lead'] || 'bg-slate-500'}>{(stage || 'lead').replace(/_/g, ' ').toUpperCase()}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Pipeline Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="outreach">Outreach</SelectItem>
              <SelectItem value="scoring">Scoring</SelectItem>
              <SelectItem value="hot_routing">Hot Routing</SelectItem>
              <SelectItem value="warm_nurture">Warm Nurture</SelectItem>
              <SelectItem value="cold_drip">Cold Drip</SelectItem>
              <SelectItem value="appointment">Appointment</SelectItem>
              <SelectItem value="close">Close</SelectItem>
            </SelectContent>
          </Select>
          <Select value={motivationFilter} onValueChange={setMotivationFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Motivation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="hot">HOT</SelectItem>
              <SelectItem value="warm">WARM</SelectItem>
              <SelectItem value="cold">COLD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seller Name *</Label>
                  <Input name="sellerName" defaultValue={editingLead?.sellerName || ''} required />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={editingLead?.phone || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input name="email" type="email" defaultValue={editingLead?.email || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Property Address *</Label>
                  <Input name="propertyAddress" defaultValue={editingLead?.propertyAddress || ''} required />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input name="city" defaultValue={editingLead?.city || ''} />
                </div>
                <div className="space-y-2">
                  <Label>ZIP Code</Label>
                  <Input name="zipCode" defaultValue={editingLead?.zipCode || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Lead Source</Label>
                  <Select name="sourceId" defaultValue={String(editingLead?.sourceId || '')}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {sources?.map((s: { id: number; name: string }) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lead Profile</Label>
                  <Select name="profileId" defaultValue={String(editingLead?.profileId || '')}>
                    <SelectTrigger><SelectValue placeholder="Select profile" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {profiles?.map((p: { id: number; name: string }) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motivation Level</Label>
                  <Select name="motivationLevel" defaultValue={editingLead?.motivationLevel || 'cold'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">HOT</SelectItem>
                      <SelectItem value="warm">WARM</SelectItem>
                      <SelectItem value="cold">COLD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timeline</Label>
                  <Input name="timeline" defaultValue={editingLead?.timeline || ''} placeholder="e.g., 30 days" />
                </div>
                <div className="space-y-2">
                  <Label>Occupancy</Label>
                  <Select name="occupancyStatus" defaultValue={editingLead?.occupancyStatus || ''}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unknown</SelectItem>
                      <SelectItem value="owner_occupied">Owner Occupied</SelectItem>
                      <SelectItem value="tenant">Tenant</SelectItem>
                      <SelectItem value="vacant">Vacant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select name="condition" defaultValue={editingLead?.condition || ''}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unknown</SelectItem>
                      <SelectItem value="move_in_ready">Move-in Ready</SelectItem>
                      <SelectItem value="light_rehab">Light Rehab</SelectItem>
                      <SelectItem value="medium_rehab">Medium Rehab</SelectItem>
                      <SelectItem value="heavy_rehab">Heavy Rehab</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Est. Repairs ($)</Label>
                  <Input name="estimatedRepairs" defaultValue={editingLead?.estimatedRepairs || ''} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Asking Price ($)</Label>
                  <Input name="askingPrice" defaultValue={editingLead?.askingPrice || ''} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>ARV ($)</Label>
                  <Input name="arv" defaultValue={editingLead?.arv || ''} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Beds</Label>
                  <Input name="beds" defaultValue={editingLead?.beds || ''} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Baths</Label>
                  <Input name="baths" defaultValue={editingLead?.baths || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Sq. Ft.</Label>
                  <Input name="squareFootage" defaultValue={editingLead?.squareFootage || ''} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Pipeline Stage</Label>
                  <Select name="pipelineStage" defaultValue={editingLead?.pipelineStage || 'lead'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="outreach">Outreach</SelectItem>
                      <SelectItem value="scoring">Scoring</SelectItem>
                      <SelectItem value="hot_routing">Hot Routing</SelectItem>
                      <SelectItem value="warm_nurture">Warm Nurture</SelectItem>
                      <SelectItem value="cold_drip">Cold Drip</SelectItem>
                      <SelectItem value="appointment">Appointment</SelectItem>
                      <SelectItem value="close">Close</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={editingLead?.notes || ''} rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                  {editingLead ? 'Update Lead' : 'Create Lead'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Motivation</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Asking Price</TableHead>
                <TableHead>ARV</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsData?.items?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500 py-12">
                    No leads found. Add your first lead to get started.
                  </TableCell>
                </TableRow>
              )}
              {leadsData?.items?.map((lead: any) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setDetailLead(lead)}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{lead.sellerName}</p>
                      <p className="text-xs text-slate-500">{lead.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{lead.propertyAddress}</p>
                    <p className="text-xs text-slate-500">{lead.city}, {lead.state}</p>
                  </TableCell>
                  <TableCell>{getMotivationBadge(lead.motivationLevel)}</TableCell>
                  <TableCell>{getStageBadge(lead.pipelineStage)}</TableCell>
                  <TableCell>
                    {lead.askingPrice ? `$${Number(lead.askingPrice).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell>
                    {lead.arv ? `$${Number(lead.arv).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">{lead.timeline || '-'}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailLead(lead)}>
                          <Eye className="w-4 h-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(lead)}>
                          <Edit3 className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/calls?leadId=${lead.id}`} className="flex items-center cursor-pointer">
                            <Phone className="w-4 h-4 mr-2" /> Log Call
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/sms?leadId=${lead.id}`} className="flex items-center cursor-pointer">
                            <MessageSquare className="w-4 h-4 mr-2" /> Send SMS
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/deals?leadId=${lead.id}`} className="flex items-center cursor-pointer">
                            <Calendar className="w-4 h-4 mr-2" /> Analyze Deal
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (confirm('Delete this lead?')) deleteLead.mutate({ id: lead.id })
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lead Detail Dialog */}
      <Dialog open={!!detailLead} onOpenChange={() => setDetailLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailLead?.sellerName}
              {detailLead?.motivationLevel && getMotivationBadge(detailLead.motivationLevel)}
            </DialogTitle>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Property</p>
                  <p className="font-medium">{detailLead.propertyAddress}</p>
                  <p>{detailLead.city}, {detailLead.state} {detailLead.zipCode}</p>
                </div>
                <div>
                  <p className="text-slate-500">Contact</p>
                  <p className="font-medium">{detailLead.phone}</p>
                  <p>{detailLead.email}</p>
                </div>
                <div>
                  <p className="text-slate-500">Timeline</p>
                  <p className="font-medium">{detailLead.timeline || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Occupancy</p>
                  <p className="font-medium capitalize">{(detailLead.occupancyStatus || 'unknown').replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-slate-500">Condition</p>
                  <p className="font-medium capitalize">{(detailLead.condition || 'unknown').replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-slate-500">Est. Repairs</p>
                  <p className="font-medium">{detailLead.estimatedRepairs ? `$${Number(detailLead.estimatedRepairs).toLocaleString()}` : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Asking Price</p>
                  <p className="font-medium">{detailLead.askingPrice ? `$${Number(detailLead.askingPrice).toLocaleString()}` : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">ARV</p>
                  <p className="font-medium">{detailLead.arv ? `$${Number(detailLead.arv).toLocaleString()}` : '-'}</p>
                </div>
              </div>
              {detailLead.keyPainPoints && (
                <div>
                  <p className="text-slate-500 text-sm">Pain Points</p>
                  <p className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">{detailLead.keyPainPoints}</p>
                </div>
              )}
              {detailLead.notes && (
                <div>
                  <p className="text-slate-500 text-sm">Notes</p>
                  <p className="text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">{detailLead.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Link to={`/calls?leadId=${detailLead.id}`}>
                  <Button size="sm" variant="outline"><Phone className="w-4 h-4 mr-1" /> Log Call</Button>
                </Link>
                <Link to={`/sms?leadId=${detailLead.id}`}>
                  <Button size="sm" variant="outline"><MessageSquare className="w-4 h-4 mr-1" /> SMS</Button>
                </Link>
                <Link to={`/deals?leadId=${detailLead.id}`}>
                  <Button size="sm" variant="outline"><Calendar className="w-4 h-4 mr-1" /> Deal Analysis</Button>
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
