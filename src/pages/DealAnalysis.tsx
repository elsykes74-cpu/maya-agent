import { useState, useEffect } from 'react'
import { trpc } from '@/providers/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Calculator, TrendingUp, DollarSign, Percent, Wrench } from 'lucide-react'

export default function DealAnalysis() {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [arv, setArv] = useState(300000)
  const [repairs, setRepairs] = useState(25000)
  const [assignmentFee, setAssignmentFee] = useState(5000)
  const [profitPct, setProfitPct] = useState(70)

  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 100 })
  const { data: dealData } = trpc.dealAnalysis.getLeadAnalysis.useQuery(
    selectedLeadId ? { leadId: Number(selectedLeadId) } : { leadId: 0 },
    { enabled: !!selectedLeadId }
  )

  const { data: maoResult } = trpc.dealAnalysis.calculateMAO.useQuery({
    arv: Number(arv),
    estimatedRepairs: Number(repairs),
    assignmentFee: Number(assignmentFee),
    profitPercentage: profitPct / 100,
  })

  const updateLead = trpc.dealAnalysis.updateLeadDeal.useMutation()

  useEffect(() => {
    if (dealData?.lead) {
      setArv(Number(dealData.lead.arv || 300000))
      setRepairs(Number(dealData.lead.estimatedRepairs || 25000))
      setAssignmentFee(Number(dealData.lead.assignmentFee || 5000))
    }
  }, [dealData])

  const mao = maoResult?.mao || 0
  const askingPrice = dealData?.analysis?.askingPrice || 0
  const spread = askingPrice - mao
  const isViable = mao > 0 && (askingPrice === 0 || mao >= askingPrice * 0.5)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
          <SelectTrigger className="w-[400px]">
            <SelectValue placeholder="Select a lead to analyze..." />
          </SelectTrigger>
          <SelectContent>
            {leadsData?.items?.map((lead: any) => (
              <SelectItem key={lead.id} value={String(lead.id)}>
                {lead.sellerName} — {lead.propertyAddress} {lead.askingPrice ? `($${Number(lead.askingPrice).toLocaleString()})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedLeadId && (
          <Button
            variant="outline"
            onClick={() => {
              updateLead.mutate({
                leadId: Number(selectedLeadId),
                arv: String(arv),
                estimatedRepairs: String(repairs),
                mao: String(mao),
                assignmentFee: String(assignmentFee),
              })
            }}
          >
            <Calculator className="w-4 h-4 mr-2" /> Save to Lead
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-600" />
              MAO Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" /> After Repair Value (ARV)
                </Label>
                <span className="text-sm font-semibold">${arv.toLocaleString()}</span>
              </div>
              <Input
                type="number"
                value={arv}
                onChange={(e) => setArv(Number(e.target.value))}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-orange-500" /> Estimated Repairs
                </Label>
                <span className="text-sm font-semibold">${repairs.toLocaleString()}</span>
              </div>
              <Input
                type="number"
                value={repairs}
                onChange={(e) => setRepairs(Number(e.target.value))}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" /> Assignment Fee
                </Label>
                <span className="text-sm font-semibold">${assignmentFee.toLocaleString()}</span>
              </div>
              <Input
                type="number"
                value={assignmentFee}
                onChange={(e) => setAssignmentFee(Number(e.target.value))}
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-purple-500" /> Profit Margin
                </Label>
                <span className="text-sm font-semibold">{profitPct}%</span>
              </div>
              <Slider
                value={[profitPct]}
                onValueChange={(v) => setProfitPct(v[0])}
                min={50}
                max={90}
                step={5}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>50%</span>
                <span>70%</span>
                <span>90%</span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-800 p-2 rounded">
                MAO = (ARV × {profitPct}%) − Repairs − Assignment Fee
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Deal Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* MAO Big Number */}
            <div className="text-center p-8 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <p className="text-sm text-emerald-700 dark:text-emerald-300 uppercase tracking-wider font-semibold">Maximum Allowable Offer (MAO)</p>
              <p className="text-5xl font-bold text-emerald-800 dark:text-emerald-200 mt-2">${mao.toLocaleString()}</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
                ({maoResult?.formula})
              </p>
            </div>

            {dealData?.analysis && askingPrice > 0 && (
              <div className={`p-6 rounded-xl ${isViable ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                <div className="flex items-center gap-3 mb-4">
                  {isViable ? (
                    <Badge className="bg-green-600 text-lg px-4 py-2">DEAL VIABLE</Badge>
                  ) : (
                    <Badge className="bg-red-600 text-lg px-4 py-2">DEAL TOO THIN</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Seller Asking</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">${askingPrice.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Your MAO</p>
                    <p className="text-2xl font-bold text-emerald-600">${mao.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Spread</p>
                    <p className={`text-2xl font-bold ${spread > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${spread > 0 ? '+' : ''}{spread.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-500">ARV</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">${arv.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-500">70% Rule</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">${(arv * profitPct / 100).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-500">Repairs</p>
                <p className="text-lg font-bold text-red-600">-${repairs.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-500">Assignment</p>
                <p className="text-lg font-bold text-red-600">-${assignmentFee.toLocaleString()}</p>
              </div>
            </div>

            {selectedLeadId && dealData?.lead && (
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3">Lead Property Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Beds / Baths</p>
                    <p className="font-medium">{dealData.lead.beds || '-'} / {dealData.lead.baths || '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Sq. Ft.</p>
                    <p className="font-medium">{dealData.lead.squareFootage ? `${dealData.lead.squareFootage.toLocaleString()} sqft` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Condition</p>
                    <p className="font-medium capitalize">{(dealData.lead.condition || 'unknown').replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Occupancy</p>
                    <p className="font-medium capitalize">{(dealData.lead.occupancyStatus || 'unknown').replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
