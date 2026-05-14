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
import { Calendar as CalendarIcon, Clock, CheckCircle2, XCircle } from 'lucide-react'

export default function Appointments() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState('')

  const { data: appointmentsData, refetch } = trpc.appointments.list.useQuery(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )
  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 100, motivation: 'all' })
  const { data: stats } = trpc.appointments.stats.useQuery()

  const createAppointment = trpc.appointments.create.useMutation({
    onSuccess: () => { refetch(); setDialogOpen(false) }
  })
  const updateAppointment = trpc.appointments.update.useMutation({ onSuccess: () => refetch() })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createAppointment.mutate({
      leadId: Number(formData.get('leadId')),
      scheduledDate: new Date(formData.get('scheduledDate') as string),
      scheduledTime: formData.get('scheduledTime') as string,
      duration: Number(formData.get('duration')) || 30,
      appointmentType: (formData.get('appointmentType') as any) || 'walkthrough',
      notes: formData.get('notes') as string || undefined,
    })
  }

  const getStatusBadge = (status: string | null) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-blue-500',
      confirmed: 'bg-indigo-500',
      completed: 'bg-emerald-500',
      cancelled: 'bg-red-500',
      no_show: 'bg-orange-500',
    }
    return <Badge className={colors[status || 'scheduled'] || 'bg-slate-500'}>{(status || 'scheduled').toUpperCase()}</Badge>
  }

  const hotLeads = leadsData?.items?.filter((l: any) => l.motivationLevel === 'hot' && !l.appointmentSet) || []

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.total || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Total Appointments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-blue-600">{stats?.scheduled || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-600">{stats?.completed || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600">{stats?.contracts || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Contracts Signed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Add */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <CalendarIcon className="w-4 h-4 mr-2" /> Schedule Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Schedule Walkthrough</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Lead</Label>
                <Select name="leadId" value={selectedLeadId} onValueChange={setSelectedLeadId}>
                  <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
                  <SelectContent>
                    {hotLeads.map((lead: any) => (
                      <SelectItem key={lead.id} value={String(lead.id)}>
                        {lead.sellerName} — {lead.propertyAddress}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input name="scheduledDate" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input name="scheduledTime" type="time" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input name="duration" type="number" defaultValue={30} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="appointmentType" defaultValue="walkthrough">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walkthrough">Walkthrough</SelectItem>
                      <SelectItem value="phone_call">Phone Call</SelectItem>
                      <SelectItem value="video_call">Video Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea name="notes" placeholder="Any specific details for the appointment..." rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Schedule</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Appointments Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>MAO Presented</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointmentsData?.items?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                    No appointments scheduled yet.
                  </TableCell>
                </TableRow>
              )}
              {appointmentsData?.items?.map((appt: any) => {
                const lead = leadsData?.items?.find((l: any) => l.id === appt.leadId)
                return (
                  <TableRow key={appt.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{new Date(appt.scheduledDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-500">{appt.scheduledTime}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{lead?.sellerName || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{lead?.propertyAddress}</p>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{appt.appointmentType?.replace('_', ' ')}</TableCell>
                    <TableCell>{getStatusBadge(appt.status)}</TableCell>
                    <TableCell>
                      {appt.maoPresented ? `$${Number(appt.maoPresented).toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell>
                      {appt.contractSigned ? (
                        <Badge className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Signed</Badge>
                      ) : (
                        <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" /> Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={appt.status}
                        onValueChange={(val) => updateAppointment.mutate({ id: appt.id, status: val as any })}
                      >
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="no_show">No Show</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
