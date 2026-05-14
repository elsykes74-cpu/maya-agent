import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MessageSquare, Send, Plus, Clock, Trash2, Edit3 } from 'lucide-react'

export default function SMSSequences() {
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [newTemplateOpen, setNewTemplateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)

  const { data: templates, refetch: refetchTemplates } = trpc.sms.templates.useQuery()
  const { data: smsLogs, refetch: refetchLogs } = trpc.sms.list.useQuery(
    selectedLeadId ? { leadId: Number(selectedLeadId) } : undefined
  )
  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 100 })

  const createTemplate = trpc.sms.createTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); setNewTemplateOpen(false); setEditingTemplate(null); }
  })
  const updateTemplate = trpc.sms.updateTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); setEditingTemplate(null); }
  })
  const deleteTemplate = trpc.sms.deleteTemplate.useMutation({ onSuccess: () => refetchTemplates() })
  const sendSMS = trpc.sms.create.useMutation({ onSuccess: () => refetchLogs() })

  const selectedLead = leadsData?.items?.find((l: any) => l.id === Number(selectedLeadId))

  const handleTemplateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name') as string,
      day: Number(formData.get('day')) || 0,
      content: formData.get('content') as string,
      description: formData.get('description') as string || undefined,
      isActive: true,
    }
    if (editingTemplate) {
      updateTemplate.mutate({ ...data, id: editingTemplate.id })
    } else {
      createTemplate.mutate(data)
    }
  }

  const handleSendSMS = (template: any) => {
    if (!selectedLeadId) return
    let content = template.content
      .replace(/\[Name\]/g, selectedLead?.sellerName || 'there')
      .replace(/\[Agent Name\]/g, 'Erick')
      .replace(/\[Street\]/g, selectedLead?.propertyAddress?.split(',')[0] || 'the property')
      .replace(/\[Street Address\]/g, selectedLead?.propertyAddress || 'the property')
      .replace(/\[Number\]/g, '(413) 555-0123')

    sendSMS.mutate({
      leadId: Number(selectedLeadId),
      sequenceDay: template.day,
      messageContent: content,
      direction: 'outbound',
      status: 'sent',
    })
  }

  const openNewTemplate = () => {
    setEditingTemplate(null)
    setNewTemplateOpen(true)
  }

  const openEditTemplate = (template: any) => {
    setEditingTemplate(template)
    setNewTemplateOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
          <SelectTrigger className="w-[360px]">
            <SelectValue placeholder="Select a lead to send SMS..." />
          </SelectTrigger>
          <SelectContent>
            {leadsData?.items?.map((lead: any) => (
              <SelectItem key={lead.id} value={String(lead.id)}>
                {lead.sellerName} — {lead.propertyAddress}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewTemplate} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'New SMS Template'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleTemplateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input name="name" defaultValue={editingTemplate?.name || ''} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sequence Day</Label>
                  <Input name="day" type="number" defaultValue={editingTemplate?.day || 0} required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" defaultValue={editingTemplate?.description || ''} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message Content</Label>
                <Textarea
                  name="content"
                  defaultValue={editingTemplate?.content || ''}
                  rows={4}
                  required
                  placeholder="Use [Name], [Street], [Agent Name], [Number] as placeholders"
                />
                <p className="text-xs text-slate-500">Available placeholders: [Name], [Street], [Street Address], [Agent Name], [Number]</p>
              </div>
              <DialogFooter>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                  {editingTemplate ? 'Update' : 'Create'} Template
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Templates */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            SMS Templates
          </h3>
          <div className="space-y-3">
            {templates?.length === 0 && (
              <Card>
                <CardContent className="text-center text-slate-500 py-12">
                  No templates yet. Create your first SMS template.
                </CardContent>
              </Card>
            )}
            {templates?.map((template: any) => (
              <Card key={template.id} className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      Day {template.day} — {template.name}
                    </CardTitle>
                    <div className="flex gap-1">
                      {selectedLeadId && (
                        <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => handleSendSMS(template)}>
                          <Send className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEditTemplate(template)}>
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => {
                        if (confirm('Delete this template?')) deleteTemplate.mutate({ id: template.id })
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{template.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm">
                    {template.content}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* SMS History */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            SMS History {selectedLead ? `— ${selectedLead.sellerName}` : ''}
          </h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsLogs?.items?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-12">
                        {selectedLeadId ? 'No SMS sent to this lead yet.' : 'Select a lead to view SMS history.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {smsLogs?.items?.map((sms: any) => (
                    <TableRow key={sms.id}>
                      <TableCell className="text-sm">{new Date(sms.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">Day {sms.sequenceDay}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{sms.messageContent}</TableCell>
                      <TableCell>
                        <Badge className={sms.status === 'replied' ? 'bg-green-500' : sms.status === 'sent' ? 'bg-blue-500' : 'bg-slate-500'}>
                          {sms.status?.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
