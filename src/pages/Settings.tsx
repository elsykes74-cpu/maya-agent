import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Shield,
  Scale,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  Building2,
  MessageSquare,
  BookOpen,
  Phone,
  Save
} from 'lucide-react'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('compliance')
  const { data: config, refetch: refetchConfig } = trpc.callingConfig.get.useQuery()
  const updateConfig = trpc.callingConfig.update.useMutation({ onSuccess: () => refetchConfig() })

  const handleSaveCallingConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!config) return
    const formData = new FormData(e.currentTarget)
    updateConfig.mutate({
      id: config.id,
      provider: (formData.get('provider') as any) || config.provider,
      apiKey: formData.get('apiKey') as string || config.apiKey || undefined,
      apiEndpoint: formData.get('apiEndpoint') as string || config.apiEndpoint || undefined,
      assistantId: formData.get('assistantId') as string || config.assistantId || undefined,
      fromPhoneNumber: formData.get('fromPhoneNumber') as string || config.fromPhoneNumber || undefined,
      maxDailyCalls: Number(formData.get('maxDailyCalls')) || config.maxDailyCalls || undefined,
      callWindowStart: formData.get('callWindowStart') as string || config.callWindowStart || undefined,
      callWindowEnd: formData.get('callWindowEnd') as string || config.callWindowEnd || undefined,
      voicemailEnabled: formData.get('voicemailEnabled') === 'on',
      smsFollowUpEnabled: formData.get('smsFollowUpEnabled') === 'on',
      scrubDncBeforeCall: formData.get('scrubDncBeforeCall') === 'on',
      scrubLitigants: formData.get('scrubLitigants') === 'on',
    })
  }

  const complianceRules = [
    {
      rule: 'Selling equitable interest — not the property',
      implication: 'No brokerage implication',
      status: 'pass',
      icon: Scale,
    },
    {
      rule: "AI never says 'we'll buy your house' as a guarantee",
      implication: 'Avoid misrepresentation',
      status: 'pass',
      icon: AlertTriangle,
    },
    {
      rule: "AI positions Erick as 'a local buyer working with a network of investment partners'",
      implication: 'Accurate representation',
      status: 'pass',
      icon: Users,
    },
    {
      rule: "Avoid 'we pay cash in 24 hours' unless you can guarantee it",
      implication: 'No deceptive language',
      status: 'pass',
      icon: MessageSquare,
    },
    {
      rule: 'Erick holds RE license — Disclose when required',
      implication: 'Never blur the investor/agent line',
      status: 'warning',
      icon: FileText,
    },
    {
      rule: 'Public records for phone numbers — property ownership is public info',
      implication: 'Legal data sourcing',
      status: 'pass',
      icon: Building2,
    },
  ]

  const targetProfiles = [
    { name: 'Pre-foreclosure / NOD Filed', priority: 1, description: 'Notice of Default filed, facing foreclosure' },
    { name: 'Probate / Inherited Property', priority: 2, description: 'Property in probate or recently inherited' },
    { name: 'Tax Delinquent (2+ years)', priority: 3, description: 'Behind on property taxes for 2+ years' },
    { name: 'Tired Landlords', priority: 4, description: 'Non-paying or vacant tenants, landlord fatigue' },
    { name: 'Code Violation Properties', priority: 5, description: 'Multiple code violations from city' },
    { name: 'Long-term Owners (20+ years)', priority: 6, description: 'Owned 20+ years, no mortgage, likely equity rich' },
    { name: 'Distressed Condition', priority: 7, description: 'Visible distress, major repairs needed' },
    { name: 'Expired / Withdrawn MLS', priority: 8, description: 'Failed MLS listing, still wants to sell' },
    { name: 'FSBOs Priced Above Market', priority: 9, description: 'For sale by owner, motivated but mispriced' },
  ]

  const pipelineStages = [
    { stage: 'Lead Source', action: 'PropStream / BatchLeads — pull distressed lists', owner: 'Erick' },
    { stage: 'Outreach', action: 'AI calling agent dials, leaves VM, triggers SMS', owner: 'AI Agent' },
    { stage: 'Scoring', action: 'AI tags lead HOT / WARM / COLD after every call', owner: 'AI Agent' },
    { stage: 'HOT Routing', action: 'Erick personally calls same day', owner: 'Erick' },
    { stage: 'WARM Nurture', action: 'SMS sequence + callback in 2 weeks', owner: 'Automated' },
    { stage: 'COLD Drip', action: 'Auto-drip at 30 / 60 / 90 days — do not chase', owner: 'Automated' },
    { stage: 'Appointment', action: 'Walkthrough scheduled — Erick presents MAO', owner: 'Erick' },
    { stage: 'Close', action: 'Contract signed — assign or double close', owner: 'Erick' },
  ]

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="calling">Calling</TabsTrigger>
          <TabsTrigger value="profiles">Profiles</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="compliance" className="space-y-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                Massachusetts Compliance Framework
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                All AI communications must adhere to Massachusetts real estate regulations. The AI agent
                sells equitable interest — not the property — and positions Erick as a local buyer working
                with a network of investment partners.
              </p>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg mb-4">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-1">AI Positioning Line — Use Verbatim:</p>
                <p className="text-sm italic text-emerald-700 dark:text-emerald-300">
                  "We work with a small group of local investors — we're not a big corporate outfit. If it's a fit, we move fast and make it simple."
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {complianceRules.map((rule, idx) => {
              const Icon = rule.icon
              return (
                <Card key={idx} className={`border-l-4 ${rule.status === 'pass' ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${rule.status === 'pass' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                        <Icon className={`w-5 h-5 ${rule.status === 'pass' ? 'text-emerald-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{rule.rule}</p>
                        <p className="text-xs text-slate-500 mt-1">{rule.implication}</p>
                        <Badge className={`mt-2 ${rule.status === 'pass' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                          {rule.status === 'pass' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                          {rule.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="calling" className="space-y-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Voice AI Provider Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Configure your voice AI calling provider (Vapi, Bland AI, Retell). The CRM sends lead data 
                and scripts to the provider, which handles the actual dialing and conversation.
              </p>
              {config && (
                <form onSubmit={handleSaveCallingConfig} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select name="provider" defaultValue={config.provider || 'vapi'}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vapi">Vapi (Recommended)</SelectItem>
                          <SelectItem value="bland">Bland AI</SelectItem>
                          <SelectItem value="retell">Retell</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>From Phone Number</Label>
                      <Input name="fromPhoneNumber" defaultValue={config.fromPhoneNumber || ''} placeholder="413-555-0100" />
                    </div>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input name="apiKey" type="password" defaultValue={config.apiKey || ''} placeholder="sk-..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Assistant ID</Label>
                      <Input name="assistantId" defaultValue={config.assistantId || ''} placeholder="Vapi assistant ID" />
                    </div>
                    <div className="space-y-2">
                      <Label>API Endpoint (optional)</Label>
                      <Input name="apiEndpoint" defaultValue={config.apiEndpoint || ''} placeholder="https://api.vapi.ai" />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Daily Calls</Label>
                      <Input name="maxDailyCalls" type="number" defaultValue={config.maxDailyCalls || 100} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Call Window Start</Label>
                      <Input name="callWindowStart" type="time" defaultValue={config.callWindowStart || '09:00'} />
                    </div>
                    <div className="space-y-2">
                      <Label>Call Window End</Label>
                      <Input name="callWindowEnd" type="time" defaultValue={config.callWindowEnd || '19:00'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="voicemailEnabled" defaultChecked={config.voicemailEnabled || true} className="rounded" /> Leave Voicemails
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="smsFollowUpEnabled" defaultChecked={config.smsFollowUpEnabled || true} className="rounded" /> SMS Follow-up After VM
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="scrubDncBeforeCall" defaultChecked={config.scrubDncBeforeCall || true} className="rounded" /> Scrub DNC Before Call
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="scrubLitigants" defaultChecked={config.scrubLitigants || true} className="rounded" /> Scrub Litigants
                    </label>
                  </div>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-2" /> Save Calling Settings
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Integration Architecture</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Your CRM manages leads, scripts, and scoring. The voice AI provider handles telephony. 
              Webhooks bring call results back into the CRM automatically.
            </p>
            <div className="space-y-2 text-xs text-slate-500">
              <p><strong>1.</strong> CRM → Provider: POST /call with lead data + system prompt</p>
              <p><strong>2.</strong> Provider → Lead: AI voice call conducted using your scripts</p>
              <p><strong>3.</strong> Provider → CRM Webhook: Call result, transcript, recording URL</p>
              <p><strong>4.</strong> CRM auto-updates lead score, pipeline stage, logs call</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Target Lead Profiles — Priority Order
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targetProfiles.map((profile) => (
                    <TableRow key={profile.priority}>
                      <TableCell>
                        <Badge className={profile.priority <= 3 ? 'bg-red-500' : profile.priority <= 6 ? 'bg-amber-500' : 'bg-slate-500'}>
                          #{profile.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{profile.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{profile.description}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {profile.priority <= 3 ? 'CALL FIRST' : profile.priority <= 6 ? 'HIGH VOLUME' : 'DRIP'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-600" />
                Pipeline Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelineStages.map((stage, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Badge className={
                          stage.owner === 'Erick' ? 'bg-emerald-500' :
                          stage.owner === 'AI Agent' ? 'bg-blue-500' :
                          'bg-slate-500'
                        }>
                          {stage.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{stage.action}</TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-medium ${
                          stage.owner === 'Erick' ? 'text-emerald-600' :
                          stage.owner === 'AI Agent' ? 'text-blue-600' :
                          'text-slate-500'
                        }`}>
                          {stage.owner}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl">
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Pipeline Philosophy</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              AI does the volume and filters hard. Erick only shows up when it's already leaning yes.
              The AI opens doors. Erick closes deals.
            </p>
            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500" /> AI Agent</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Erick</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-500" /> Automated</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
