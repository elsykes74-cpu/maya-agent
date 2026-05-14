import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Bot,
  Save,
  Plus,
  Trash2,
  Edit3,
  Shield,
  MessageSquare,
  Phone,
  ChevronRight,
} from 'lucide-react'

export default function AIConfig() {
  const [activeTab, setActiveTab] = useState('system')
  const [editingScript, setEditingScript] = useState<string | null>(null)
  const [newObjectionOpen, setNewObjectionOpen] = useState(false)

  const { data: config, refetch: refetchConfig } = trpc.aiConfig.get.useQuery()
  const { data: objections, refetch: refetchObjections } = trpc.aiConfig.objections.useQuery()

  const updateConfig = trpc.aiConfig.update.useMutation({ onSuccess: () => refetchConfig() })
  const createObjection = trpc.aiConfig.createObjection.useMutation({ onSuccess: () => { refetchObjections(); setNewObjectionOpen(false) } })
  const deleteObjection = trpc.aiConfig.deleteObjection.useMutation({ onSuccess: () => refetchObjections() })

  const scriptFields = [
    { key: 'systemPrompt', label: 'System Prompt / Role', icon: Bot, description: 'Core AI personality and objective' },
    { key: 'openerScript', label: 'Opening Script', icon: Phone, description: 'Pattern interrupt opener' },
    { key: 'discoveryQuestions', label: 'Discovery Questions', icon: MessageSquare, description: 'Motivation extraction questions' },
    { key: 'positioningScript', label: 'Psychological Positioning', icon: ChevronRight, description: 'Mirror pain, pivot to ease' },
    { key: 'priceAnchorScript', label: 'Price Anchor Script', icon: ChevronRight, description: 'Soft price discussion' },
    { key: 'closeScript', label: 'Appointment Close', icon: ChevronRight, description: 'Set the walkthrough appointment' },
    { key: 'voicemailScript', label: 'Voicemail Script', icon: Phone, description: '20-second curiosity voicemail' },
    { key: 'complianceDisclaimer', label: 'Compliance Disclaimer', icon: Shield, description: 'Legal positioning notes' },
  ]

  const handleSaveScript = (field: string, value: string) => {
    if (!config) return
    updateConfig.mutate({ id: config.id, [field]: value })
    setEditingScript(null)
  }

  const handleNewObjection = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createObjection.mutate({
      objection: formData.get('objection') as string,
      response: formData.get('response') as string,
      category: formData.get('category') as string || undefined,
      priority: Number(formData.get('priority')) || 0,
    })
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-[300px]">
          <TabsTrigger value="system">AI Scripts</TabsTrigger>
          <TabsTrigger value="objections">Objections</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {scriptFields.map((field) => {
              const Icon = field.icon
              const value = (config as any)?.[field.key] || ''
              const isEditing = editingScript === field.key

              return (
                <Card key={field.key} className="border-l-4 border-l-emerald-500">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="w-4 h-4 text-emerald-600" />
                        {field.label}
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-1">{field.description}</p>
                    </div>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingScript(null)}>Cancel</Button>
                        <Button size="sm" className="bg-emerald-600" onClick={() => {
                          const textarea = document.getElementById(`edit-${field.key}`) as HTMLTextAreaElement
                          if (textarea) handleSaveScript(field.key, textarea.value)
                        }}>
                          <Save className="w-4 h-4 mr-1" /> Save
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setEditingScript(field.key)}>
                        <Edit3 className="w-4 h-4 mr-1" /> Edit
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <Textarea
                        id={`edit-${field.key}`}
                        defaultValue={value}
                        rows={8}
                        className="font-mono text-sm"
                      />
                    ) : (
                      <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg text-sm whitespace-pre-wrap font-mono leading-relaxed">
                        {value || 'Not configured'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="objections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Objection Handling Library</h3>
            <Dialog open={newObjectionOpen} onOpenChange={setNewObjectionOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-2" /> Add Objection
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Objection Response</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleNewObjection} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Objection</Label>
                    <Input name="objection" placeholder="e.g., I want full market value" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Response</Label>
                    <Textarea name="response" placeholder="Your scripted response..." rows={3} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input name="category" placeholder="e.g., Price" />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input name="priority" type="number" defaultValue={0} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600">Add Response</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Objection</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objections?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-12">
                        No objections configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {objections?.map((obj: any) => (
                    <TableRow key={obj.id}>
                      <TableCell className="font-medium text-sm">{obj.objection}</TableCell>
                      <TableCell className="text-sm italic text-emerald-700 dark:text-emerald-300 max-w-[300px]">{obj.response}</TableCell>
                      <TableCell>
                        {obj.category && <Badge variant="outline">{obj.category}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            if (confirm('Delete this objection?')) deleteObjection.mutate({ id: obj.id })
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
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
