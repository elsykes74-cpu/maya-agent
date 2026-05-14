import { useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield,
  PhoneOff,
  Ban,
  AlertTriangle,
  Trash2,
  Upload,
  Search,
  Scale,
  CheckCircle2
} from 'lucide-react'

export default function DNCLists() {
  const [activeTab, setActiveTab] = useState('dnc')
  const [search, setSearch] = useState('')
  const [newDncOpen, setNewDncOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)

  const { data: dncData, refetch: refetchDnc } = trpc.dnc.list.useQuery({
    search: search || undefined,
    limit: 50,
  })
  const { data: dncStats } = trpc.dnc.stats.useQuery()
  const { data: scrubLists } = trpc.dnc.scrubLists.useQuery()

  const addDnc = trpc.dnc.add.useMutation({ onSuccess: () => { refetchDnc(); setNewDncOpen(false); } })
  const removeDnc = trpc.dnc.remove.useMutation({ onSuccess: () => refetchDnc() })
  const bulkImport = trpc.dnc.bulkImport.useMutation({
    onSuccess: () => { refetchDnc(); setBulkImportOpen(false); }
  })

  const handleNewDnc = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    addDnc.mutate({
      phone: formData.get('phone') as string,
      name: formData.get('name') as string || undefined,
      reason: (formData.get('reason') as any) || 'manual',
      source: formData.get('source') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    })
  }

  const handleBulkImport = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const rawText = formData.get('numbers') as string
    const numbers = rawText.split(/\n|,|;/).map(n => n.trim()).filter(n => n.length >= 10)
    bulkImport.mutate({
      numbers,
      reason: (formData.get('reason') as any) || 'manual',
      source: formData.get('source') as string || undefined,
    })
  }

  const getReasonBadge = (reason: string | null) => {
    const colors: Record<string, string> = {
      seller_request: 'bg-red-500',
      national_registry: 'bg-orange-500',
      litigant: 'bg-purple-500',
      disconnected: 'bg-slate-500',
      manual: 'bg-blue-500',
    }
    return <Badge className={colors[reason || 'manual'] || 'bg-slate-500'}>{(reason || 'manual').replace('_', ' ').toUpperCase()}</Badge>
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-[300px]">
          <TabsTrigger value="dnc">DNC List</TabsTrigger>
          <TabsTrigger value="scrub">Scrub Lists</TabsTrigger>
        </TabsList>

        <TabsContent value="dnc" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{dncStats?.total || 0}</div>
                <p className="text-xs text-slate-500 mt-1">Total Blocked</p>
              </CardContent>
            </Card>
            {dncStats?.byReason?.map((r: any) => (
              <Card key={r.reason}>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{r.count}</div>
                  <p className="text-xs text-slate-500 mt-1 capitalize">{r.reason?.replace('_', ' ')}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search phone or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" /> Bulk Import
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bulk Import DNC Numbers</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleBulkImport} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Numbers (one per line, or comma-separated)</Label>
                      <Textarea name="numbers" placeholder="4135550100&#10;4135550101&#10;4135550102" rows={6} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <Select name="reason" defaultValue="manual">
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="seller_request">Seller Request</SelectItem>
                            <SelectItem value="national_registry">National Registry</SelectItem>
                            <SelectItem value="litigant">Litigant</SelectItem>
                            <SelectItem value="disconnected">Disconnected</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Source</Label>
                        <Input name="source" placeholder="e.g., BatchLeads scrub" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-emerald-600">Import {dncStats?.total || 0} Numbers</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={newDncOpen} onOpenChange={setNewDncOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-red-600 hover:bg-red-700">
                    <PhoneOff className="w-4 h-4 mr-2" /> Add DNC
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add to Do Not Call List</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleNewDnc} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input name="phone" placeholder="413-555-0100" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Name (optional)</Label>
                      <Input name="name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Select name="reason" defaultValue="seller_request">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seller_request">Seller Request</SelectItem>
                          <SelectItem value="national_registry">National Registry</SelectItem>
                          <SelectItem value="litigant">Known Litigant</SelectItem>
                          <SelectItem value="disconnected">Disconnected</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea name="notes" placeholder="Why this number is blocked..." rows={2} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-red-600 hover:bg-red-700">Add to DNC</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* DNC Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dncData?.items?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                        No DNC entries. Add numbers to protect against TCPA violations.
                      </TableCell>
                    </TableRow>
                  )}
                  {dncData?.items?.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-sm">{entry.phone}</TableCell>
                      <TableCell className="text-sm">{entry.name || '-'}</TableCell>
                      <TableCell>{getReasonBadge(entry.reason)}</TableCell>
                      <TableCell className="text-sm">{entry.source || '-'}</TableCell>
                      <TableCell className="text-sm">{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            if (confirm('Remove from DNC?')) removeDnc.mutate({ id: entry.id })
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

        <TabsContent value="scrub" className="space-y-4">
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                Scrub List Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Before any call campaign runs, numbers are automatically scrubbed against:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Ban className="w-5 h-5 text-red-600" />
                    <p className="font-semibold text-sm">DNC List</p>
                  </div>
                  <p className="text-xs text-slate-600">Internal Do Not Call registry. Sellers who explicitly requested no calls.</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className="w-5 h-5 text-purple-600" />
                    <p className="font-semibold text-sm">Litigant Scrub</p>
                  </div>
                  <p className="text-xs text-slate-600">Known TCPA litigants. Protect against lawsuit exposure.</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-slate-600" />
                    <p className="font-semibold text-sm">Disconnected</p>
                  </div>
                  <p className="text-xs text-slate-600">Known disconnected/wrong numbers from previous campaigns.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>List Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entries</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrubLists?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-12">
                        No scrub lists yet. Create lists for litigants and disconnected numbers.
                      </TableCell>
                    </TableRow>
                  )}
                  {scrubLists?.map((list: any) => (
                    <TableRow key={list.id}>
                      <TableCell className="font-medium text-sm">{list.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{list.listType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{list.entries?.length || 0} numbers</TableCell>
                      <TableCell>
                        {list.isActive ? (
                          <Badge className="bg-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
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
