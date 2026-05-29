import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import {
  PhoneCall, MapPin, Flame, Snowflake, Thermometer,
  Plus, Search, Home, Wrench, Banknote, Clock, Users,
} from 'lucide-react';
import { DEMO_LEADS } from '@/data/demo';

type FilterTab = 'all' | 'hot' | 'warm' | 'cold';
type MotivationLevel = 'hot' | 'warm' | 'cold';

export default function Leads() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.leads.list.useQuery(
    { motivationLevel: filter === 'all' ? undefined : filter },
    { retry: false }
  );

  const addMutation = trpc.leads.create.useMutation({
    onSuccess: () => { utils.leads.list.invalidate(); setShowAdd(false); },
  });

  const leads = data?.items ?? DEMO_LEADS;

  const filteredLeads = searchQuery
    ? leads.filter((l: any) =>
        l.sellerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.propertyAddress?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone?.includes(searchQuery)
      )
    : leads;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: leads.length },
    { key: 'hot', label: 'Hot', count: leads.filter((l: any) => l.motivationLevel === 'hot').length },
    { key: 'warm', label: 'Warm', count: leads.filter((l: any) => l.motivationLevel === 'warm').length },
    { key: 'cold', label: 'Cold', count: leads.filter((l: any) => l.motivationLevel === 'cold').length },
  ];

  return (
    <div className="min-h-full">
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">Leads</h1>
          <button
            onClick={() => setShowAdd(true)}
            aria-label="Add lead"
            className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-11 bg-white rounded-xl flex items-center px-4 gap-2 shadow-sm">
            <Search size={18} className="text-[#8E8E93]" />
            <input
              type="text"
              placeholder="Search leads..."
              className="flex-1 bg-transparent text-[17px] outline-none placeholder:text-[#C6C6C8]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-full text-[15px] font-medium whitespace-nowrap transition-all ${
                filter === tab.key ? 'bg-[#007AFF] text-white shadow-md' : 'bg-white text-[#8E8E93]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-3 mt-2">
        {isLoading && <div className="py-20 text-center text-[#8E8E93] text-[17px]">Loading leads...</div>}

        {!isLoading && filteredLeads.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <Users size={36} className="text-[#C6C6C8]" />
            </div>
            <p className="text-[17px] text-[#8E8E93] mt-4">No leads found</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 ios-btn ios-btn-primary px-6 py-3 text-[16px]">
              <Plus size={16} /> Add Your First Lead
            </button>
          </div>
        )}

        {filteredLeads.map((lead: any) => (
          <div key={lead.id} className="ios-card overflow-hidden">
            <div className="p-4 pb-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-[20px] font-bold text-[#1C1C1E]">{lead.sellerName}</p>
                  <div className="flex items-center gap-1 mt-1 text-[#8E8E93]">
                    <MapPin size={14} />
                    <p className="text-[15px] truncate max-w-[260px]">{lead.propertyAddress}</p>
                  </div>
                </div>
                <MotivationBadge level={lead.motivationLevel} />
              </div>

              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-2 mt-3 text-[15px] text-[#007AFF]"
                  aria-label={`Call ${lead.sellerName}`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#E5F0FF] flex items-center justify-center">
                    <PhoneCall size={14} />
                  </div>
                  <span className="font-medium">{lead.phone}</span>
                </a>
              )}
            </div>

            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {lead.timeline && <QualTag icon={<Clock size={14} />} label="Timeline" value={lead.timeline} />}
                {lead.askingPrice && <QualTag icon={<Banknote size={14} />} label="Asking" value={`$${Number(lead.askingPrice).toLocaleString()}`} />}
                {lead.arv && <QualTag icon={<Home size={14} />} label="ARV" value={`$${Number(lead.arv).toLocaleString()}`} />}
                {lead.estimatedRepairs && Number(lead.estimatedRepairs) > 0 && <QualTag icon={<Wrench size={14} />} label="Repairs" value={`$${Number(lead.estimatedRepairs).toLocaleString()}`} />}
                {lead.beds && <QualTag icon={<Home size={14} />} label="Bed/Bath" value={`${lead.beds}bd/${lead.baths ?? '?'}ba`} />}
                {lead.condition && <QualTag icon={<Thermometer size={14} />} label="Condition" value={lead.condition.replace(/_/g, ' ')} />}
              </div>

              {lead.keyPainPoints && (
                <div className="mt-3 p-3 bg-[#FFF9E5] rounded-xl">
                  <p className="text-[13px] font-semibold text-[#FF9500] mb-1">Motivation</p>
                  <p className="text-[15px] text-[#1C1C1E]">{lead.keyPainPoints}</p>
                </div>
              )}

              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="ios-btn ios-btn-green w-full mt-3 text-[16px] py-3"
                  aria-label={`Call ${lead.sellerName} now`}
                >
                  <PhoneCall size={18} /> Call Now
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddLeadSheet
          onClose={() => setShowAdd(false)}
          onAdd={(d) => addMutation.mutate(d)}
          isSubmitting={addMutation.isPending}
        />
      )}

      <div className="h-4" />
    </div>
  );
}

function AddLeadSheet({
  onClose,
  onAdd,
  isSubmitting,
}: {
  onClose: () => void;
  onAdd: (data: { sellerName: string; propertyAddress: string; phone?: string; motivationLevel: MotivationLevel }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [motivation, setMotivation] = useState<MotivationLevel>('cold');

  const canSubmit = name.trim() && address.trim() && !isSubmitting;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="bottom-sheet p-5 z-50">
        <div className="w-10 h-1 bg-[#C6C6C8] rounded-full mx-auto mb-5" />
        <h2 className="text-[22px] font-bold mb-4">Add Lead</h2>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-[15px] font-medium mb-2 block">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Sarah Johnson"
              className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div>
            <label className="text-[15px] font-medium mb-2 block">Property Address *</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="142 Maple St, Springfield, MA"
              className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div>
            <label className="text-[15px] font-medium mb-2 block">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(413) 555-0123"
              className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div>
            <label className="text-[15px] font-medium mb-2 block">Motivation</label>
            <div className="flex gap-2">
              {(['hot', 'warm', 'cold'] as MotivationLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setMotivation(level)}
                  className={`flex-1 py-2.5 rounded-xl text-[15px] font-semibold capitalize transition-all ${
                    motivation === level
                      ? level === 'hot' ? 'bg-[#FF3B30] text-white' : level === 'warm' ? 'bg-[#FF9500] text-white' : 'bg-[#8E8E93] text-white'
                      : 'bg-[#F2F2F7] text-[#8E8E93]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => canSubmit && onAdd({ sellerName: name.trim(), propertyAddress: address.trim(), phone: phone.trim() || undefined, motivationLevel: motivation })}
          disabled={!canSubmit}
          className="w-full ios-btn ios-btn-primary text-[18px] py-4 disabled:opacity-50"
        >
          {isSubmitting ? 'Adding...' : 'Add Lead'}
        </button>
        <button onClick={onClose} className="w-full mt-2 text-[17px] text-[#8E8E93] py-3 font-medium">
          Cancel
        </button>
      </div>
    </>
  );
}

function MotivationBadge({ level }: { level: string | null }) {
  if (level === 'hot') return <span className="ios-badge ios-badge-hot flex items-center gap-1"><Flame size={12} /> HOT</span>;
  if (level === 'warm') return <span className="ios-badge ios-badge-warm flex items-center gap-1"><Thermometer size={12} /> WARM</span>;
  return <span className="ios-badge ios-badge-cold flex items-center gap-1"><Snowflake size={12} /> COLD</span>;
}

function QualTag({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-[#F2F2F7] rounded-lg">
      <span className="text-[#8E8E93]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-[#8E8E93] uppercase tracking-wide">{label}</p>
        <p className="text-[14px] font-semibold text-[#1C1C1E] truncate capitalize">{value}</p>
      </div>
    </div>
  );
}
