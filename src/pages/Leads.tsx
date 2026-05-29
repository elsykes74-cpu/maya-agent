import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import {
  PhoneCall, MapPin, Flame, Snowflake, Thermometer,
  Plus, Search, Home, Wrench, Banknote, Clock
} from 'lucide-react';

const DEMO_LEADS = [
  { id: 1, sellerName: 'Sarah Johnson', propertyAddress: '142 Maple St, Springfield, MA', phone: '(413) 555-0123', motivationLevel: 'hot', timeline: '30 days', askingPrice: '185000', arv: '280000', estimatedRepairs: '25000', beds: 3, baths: 1.5, condition: 'medium_rehab', keyPainPoints: 'Inherited property, lives out of state, wants quick cash sale' },
  { id: 2, sellerName: 'Mike Chen', propertyAddress: '78 Oak Avenue, Holyoke, MA', phone: '(413) 555-0456', motivationLevel: 'hot', timeline: '2 weeks', askingPrice: '120000', arv: '195000', estimatedRepairs: '35000', beds: 2, baths: 1, condition: 'heavy_rehab', keyPainPoints: 'Behind on mortgage payments, facing foreclosure' },
  { id: 3, sellerName: 'Emma Davis', propertyAddress: '256 Elm Street, Chicopee, MA', phone: '(413) 555-0789', motivationLevel: 'warm', timeline: '60 days', askingPrice: '220000', arv: '310000', estimatedRepairs: '15000', beds: 4, baths: 2, condition: 'light_rehab', keyPainPoints: 'Downsizing, already purchased new home' },
  { id: 4, sellerName: 'Robert Wilson', propertyAddress: '89 Pine Road, Westfield, MA', phone: '(413) 555-0321', motivationLevel: 'cold', timeline: '6 months', askingPrice: '350000', arv: '420000', estimatedRepairs: '5000', beds: 4, baths: 2.5, condition: 'move_in_ready', keyPainPoints: 'Testing market, not urgent' },
];

type FilterTab = 'all' | 'hot' | 'warm' | 'cold';

export default function Leads() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = trpc.leads.list.useQuery(
    { motivationLevel: filter === 'all' ? undefined : filter },
    { retry: false }
  );

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
          <button className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white shadow-lg">
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
              <UsersIcon />
            </div>
            <p className="text-[17px] text-[#8E8E93] mt-4">No leads found</p>
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
                <div className="flex items-center gap-2 mt-3 text-[15px] text-[#007AFF]">
                  <div className="w-8 h-8 rounded-full bg-[#E5F0FF] flex items-center justify-center">
                    <PhoneCall size={14} />
                  </div>
                  <span className="font-medium">{lead.phone}</span>
                </div>
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

              <button className="ios-btn ios-btn-green w-full mt-3 text-[16px] py-3">
                <PhoneCall size={18} /> Call Now
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="h-4" />
    </div>
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

function UsersIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C6C6C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
