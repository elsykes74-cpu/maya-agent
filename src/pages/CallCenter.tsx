import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Phone,
  MessageSquare,
  Voicemail,
  Mic,
  ChevronRight,
  Save
} from 'lucide-react'

export default function CallCenter() {
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('scripts')
  const [callDialogOpen, setCallDialogOpen] = useState(false)

  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 100 })
  const { data: aiConfig } = trpc.aiConfig.get.useQuery()
  const { data: callsData, refetch: refetchCalls } = trpc.calls.list.useQuery(
    selectedLeadId ? { leadId: selectedLeadId } : undefined
  )
  const { data: objections } = trpc.aiConfig.objections.useQuery()
  const createCall = trpc.calls.create.useMutation({ onSuccess: () => { refetchCalls(); setCallDialogOpen(false) } })
  const [dialStatus, setDialStatus] = useState<string | null>(null)
  const dialLead = trpc.calls.dial.useMutation({
    onSuccess: (data) => {
      setDialStatus(`✅ AI agent dialing ${selectedLead?.sellerName}… (call ID: ${data.callId})`)
      setTimeout(() => setDialStatus(null), 8000)
      refetchCalls()
    },
    onError: (err) => {
      setDialStatus(`❌ ${err.message}`)
      setTimeout(() => setDialStatus(null), 6000)
    },
  })

  const selectedLead = leadsData?.items?.find((l: any) => l.id === selectedLeadId)

  const handleLogCall = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedLeadId) return
    const formData = new FormData(e.currentTarget)
    createCall.mutate({
      leadId: selectedLeadId,
      callType: (formData.get('callType') as any) || 'initial',
      callOutcome: (formData.get('callOutcome') as any) || 'answered',
      duration: Number(formData.get('duration')) || 0,
      notes: formData.get('notes') as string,
      painSignals: formData.get('painSignals') as string || undefined,
      priceDiscussed: formData.get('priceDiscussed') === 'on',
      sellerAskingPrice: formData.get('sellerAskingPrice') as string || undefined,
      voicemailLeft: formData.get('voicemailLeft') === 'on',
      smsSent: formData.get('smsSent') === 'on',
      appointmentSet: formData.get('appointmentSet') === 'on',
    })
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getOutcomeBadge = (outcome: string | null) => {
    const colors: Record<string, string> = {
      answered: 'bg-emerald-500',
      voicemail: 'bg-amber-500',
      no_answer: 'bg-slate-400',
      busy: 'bg-orange-500',
      wrong_number: 'bg-red-500',
      disconnected: 'bg-red-600',
      callback_requested: 'bg-blue-500',
      appointment_set: 'bg-purple-500',
      not_interested: 'bg-gray-500',
      dnc: 'bg-black',
    }
    return <Badge className={colors[outcome || 'answered'] || 'bg-slate-500'}>{(outcome || 'answered').replace(/_/g, ' ').toUpperCase()}</Badge>
  }

  const scriptSections = [
    { key: 'opener', title: 'Opening — Pattern Interrupt', icon: Phone, content: aiConfig?.openerScript },
    { key: 'discovery', title: 'Discovery — Extract Motivation', icon: Mic, content: aiConfig?.discoveryQuestions },
    { key: 'positioning', title: 'Psychological Positioning', icon: MessageSquare, content: aiConfig?.positioningScript },
    { key: 'price', title: 'Price Anchor — Soft, Not Aggressive', icon: ChevronRight, content: aiConfig?.priceAnchorScript },
    { key: 'close', title: 'Appointment Close — The Only Goal', icon: ChevronRight, content: aiConfig?.closeScript },
    { key: 'voicemail', title: 'Voicemail Script', icon: Voicemail, content: aiConfig?.voicemailScript },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-3 items-center">
          <Select value={selectedLeadId ? String(selectedLeadId) : ''} onValueChange={(v) => setSelectedLeadId(Number(v))}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Select a lead to call..." />
            </SelectTrigger>
            <SelectContent>
              {leadsData?.items?.map((lead: any) => (
                <SelectItem key={lead.id} value={String(lead.id)}>
                  {lead.sellerName} — {lead.propertyAddress}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedLead && (
            <Badge className={selectedLead.motivationLevel === 'hot' ? 'bg-red-500' : selectedLead.motivationLevel === 'warm' ? 'bg-amber-500' : 'bg-cyan-500'}>
              {selectedLead.motivationLevel?.toUpperCase()}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            disabled={!selectedLeadId || dialLead.isPending}
            onClick={() => selectedLeadId && dialLead.mutate({ leadId: selectedLeadId })}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Phone className="w-4 h-4 mr-2" />
            {dialLead.isPending ? 'Connecting…' : 'Call with AI Agent'}
          </Button>
          <Dialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedLeadId} className="bg-emerald-600 hover:bg-emerald-700">
              <Phone className="w-4 h-4 mr-2" /> Log Call
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Log Call — {selectedLead?.sellerName}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleLogCall} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Call Type</Label>
                  <Select name="callType" defaultValue="initial">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">Initial</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="appointment_confirmation">Appointment Confirmation</SelectItem>
                      <SelectItem value="voicemail">Voicemail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Outcome</Label>
                  <Select name="callOutcome" defaultValue="answered">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="answered">Answered</SelectItem>
                      <SelectItem value="voicemail">Voicemail</SelectItem>
                      <SelectItem value="no_answer">No Answer</SelectItem>
                      <SelectItem value="busy">Busy</SelectItem>
                      <SelectItem value="wrong_number">Wrong Number</SelectItem>
                      <SelectItem value="disconnected">Disconnected</SelectItem>
                      <SelectItem value="callback_requested">Callback Requested</SelectItem>
                      <SelectItem value="appointment_set">Appointment Set</SelectItem>
                      <SelectItem value="not_interested">Not Interested</SelectItem>
                      <SelectItem value="dnc">Do Not Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration (seconds)</Label>
                  <Input name="duration" type="number" placeholder="120" />
                </div>
                <div className="space-y-2">
                  <Label>Seller Asking Price</Label>
                  <Input name="sellerAskingPrice" type="number" placeholder="150000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Call Notes</Label>
                <Textarea name="notes" placeholder="What did they say? Pain signals, objections, key details..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Pain Signals</Label>
                <Textarea name="painSignals" placeholder="Financial pressure, tenant problems, maintenance fatigue, life events..." rows={2} />
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="priceDiscussed" className="rounded" /> Price Discussed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="voicemailLeft" className="rounded" /> Voicemail Left
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="smsSent" className="rounded" /> SMS Sent
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="appointmentSet" className="rounded" /> Appointment Set
                </label>
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-2" /> Save Call Log
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      {dialStatus && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${dialStatus.startsWith('✅') ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200'}`}>
          {dialStatus}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="objections">Objections</TabsTrigger>
          <TabsTrigger value="history">Call History</TabsTrigger>
        </TabsList>

        <TabsContent value="scripts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scriptSections.map((section) => {
              const Icon = section.icon
              return (
                <Card key={section.key} className="border-l-4 border-l-emerald-500">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className="w-4 h-4 text-emerald-600" />
                      {section.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm whitespace-pre-wrap font-mono leading-relaxed">
                      {section.content || 'Configure scripts in AI Agent Settings'}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="objections" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {objections?.length === 0 && (
              <Card>
                <CardContent className="text-center py-12 text-slate-500">
                  No objection responses configured yet.
                </CardContent>
              </Card>
            )}
            {objections?.map((obj: any) => (
              <Card key={obj.id} className="border-l-4 border-l-amber-500">
                <CardHeader>
                  <CardTitle className="text-base">{obj.objection}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                    <p className="text-sm text-emerald-800 dark:text-emerald-200 italic">"{obj.response}"</p>
                  </div>
                  {obj.category && (
                    <Badge variant="outline" className="mt-3">{obj.category}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call History {selectedLead ? `— ${selectedLead.sellerName}` : ''}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Price Discussed</TableHead>
                    <TableHead>Appt Set</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callsData?.items?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                        {selectedLeadId ? 'No calls logged for this lead yet.' : 'Select a lead to view call history.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {callsData?.items?.map((call: any) => (
                    <TableRow key={call.id}>
                      <TableCell className="text-sm">{new Date(call.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm capitalize">{call.callType?.replace('_', ' ')}</TableCell>
                      <TableCell>{getOutcomeBadge(call.callOutcome)}</TableCell>
                      <TableCell className="text-sm">{formatDuration(call.duration || 0)}</TableCell>
                      <TableCell>{call.priceDiscussed ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{call.appointmentSet ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{call.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
