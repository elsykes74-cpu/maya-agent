import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneCall, Users, Zap, Calendar, Flame, Clock, Megaphone } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { DEMO_LEADS, DEMO_CALLS, DEMO_CAMPAIGNS } from '@/data/demo';

export default function Home() {
  const navigate = useNavigate();

  const [greeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  });

  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 10 }, { retry: false });
  const { data: callsData } = trpc.calls.list.useQuery({}, { retry: false });
  const { data: campaignsData } = trpc.campaigns.list.useQuery({}, { retry: false });

  const leads = leadsData?.items ?? DEMO_LEADS;
  const calls = callsData?.items ?? DEMO_CALLS;
  const campaigns = campaignsData?.items ?? DEMO_CAMPAIGNS;

  const hotLeads = leads.filter((l: any) => l.motivationLevel === 'hot').length;
  const todayCalls = calls.length;
  const activeCampaigns = campaigns.filter((c: any) => c.status === 'active').length;

  const QUICK_ACTIONS = [
    { icon: <PhoneCall size={28} />, label: 'Start Calling', color: 'bg-[#007AFF]', to: '/calls' },
    { icon: <Users size={28} />, label: 'Add Lead', color: 'bg-[#34C759]', to: '/leads' },
    { icon: <Megaphone size={28} />, label: 'New Campaign', color: 'bg-[#FF9500]', to: '/campaigns' },
    { icon: <Calendar size={28} />, label: 'Schedule', color: 'bg-[#AF52DE]', to: '/appointments' },
  ];

  return (
    <div className="min-h-full">
      <div className="px-5 pt-6 pb-4">
        <p className="text-[15px] text-[#8E8E93]">{greeting}</p>
        <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">Dashboard</h1>
      </div>

      {/* KPI grid */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-6">
        <button onClick={() => navigate('/leads')} className="ios-card p-4 text-left active:scale-95 transition-transform">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2F2F7] flex items-center justify-center">
              <Users size={22} className="text-[#FF3B30]" />
            </div>
            <span className="ios-badge ios-badge-hot">HOT</span>
          </div>
          <p className="text-[32px] font-bold text-[#1C1C1E] leading-none">{hotLeads}</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">Hot Leads</p>
        </button>

        <button onClick={() => navigate('/calls')} className="ios-card p-4 text-left active:scale-95 transition-transform">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2F2F7] flex items-center justify-center">
              <PhoneCall size={22} className="text-[#007AFF]" />
            </div>
            <span className="ios-badge ios-badge-blue">TODAY</span>
          </div>
          <p className="text-[32px] font-bold text-[#1C1C1E] leading-none">{todayCalls}</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">Calls Today</p>
        </button>

        <button onClick={() => navigate('/campaigns')} className="ios-card p-4 text-left active:scale-95 transition-transform">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2F2F7] flex items-center justify-center">
              <Zap size={22} className="text-[#FF9500]" />
            </div>
            <span className="ios-badge ios-badge-warm">LIVE</span>
          </div>
          <p className="text-[32px] font-bold text-[#1C1C1E] leading-none">{activeCampaigns}</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">Active Campaigns</p>
        </button>

        <button onClick={() => navigate('/appointments')} className="ios-card p-4 text-left active:scale-95 transition-transform">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F2F2F7] flex items-center justify-center">
              <Calendar size={22} className="text-[#34C759]" />
            </div>
            <span className="ios-badge ios-badge-green">TODAY</span>
          </div>
          <p className="text-[32px] font-bold text-[#1C1C1E] leading-none">2</p>
          <p className="text-[13px] text-[#8E8E93] mt-1">Appointments</p>
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-5 mb-6">
        <p className="ios-subheader">Quick Actions</p>
        <div className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory pb-1">
          {QUICK_ACTIONS.map((item) => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              aria-label={item.label}
              className="snap-start flex flex-col items-center gap-2 min-w-[80px] active:scale-95 transition-transform"
            >
              <div className={`w-16 h-16 ${item.color} rounded-2xl flex items-center justify-center text-white shadow-lg`}>
                {item.icon}
              </div>
              <span className="text-[12px] font-medium text-[#1C1C1E]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="ios-subheader !m-0">Recent Calls</p>
          <button onClick={() => navigate('/calls')} className="text-[#007AFF] text-[15px] font-medium active:opacity-60">
            See All
          </button>
        </div>
        <div className="ios-card divide-y divide-[#E5E5EA]">
          {calls.slice(0, 3).map((call: any) => (
            <div key={call.id} className="flex items-center gap-4 p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${call.outcome === 'connected' ? 'bg-[#E5F9ED]' : 'bg-[#FFE5E5]'}`}>
                <PhoneCall size={18} className={call.outcome === 'connected' ? 'text-[#34C759]' : 'text-[#FF3B30]'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-medium text-[#1C1C1E] truncate">{call.leadName}</p>
                <p className="text-[13px] text-[#8E8E93]">
                  {call.outcome === 'connected' ? 'Connected' : call.outcome === 'voicemail' ? 'Voicemail' : 'No Answer'}
                  {' · '}
                  {new Date(call.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <span className="text-[13px] text-[#8E8E93]">{call.duration}s</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hot Leads */}
      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="ios-subheader !m-0 flex items-center gap-1">
            <Flame size={14} className="text-[#FF3B30]" /> Hot Leads
          </p>
          <button onClick={() => navigate('/leads')} className="text-[#007AFF] text-[15px] font-medium active:opacity-60">
            See All
          </button>
        </div>
        <div className="space-y-3">
          {leads.filter((l: any) => l.motivationLevel === 'hot').map((lead: any) => (
            <div key={lead.id} className="ios-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[17px] font-semibold text-[#1C1C1E]">{lead.sellerName}</p>
                  <p className="text-[13px] text-[#8E8E93] truncate max-w-[240px]">{lead.propertyAddress}</p>
                </div>
                <span className="ios-badge ios-badge-hot">HOT</span>
              </div>
              <div className="flex items-center gap-4 text-[13px] text-[#8E8E93]">
                <span className="flex items-center gap-1"><PhoneCall size={12} /> {lead.phone}</span>
                {lead.timeline && <span className="flex items-center gap-1"><Clock size={12} /> {lead.timeline}</span>}
              </div>
              {lead.keyPainPoints && (
                <div className="mt-2 p-2 bg-[#FFF9E5] rounded-lg">
                  <p className="text-[13px] text-[#FF9500] font-medium">Motivation</p>
                  <p className="text-[14px] text-[#1C1C1E] mt-0.5">{lead.keyPainPoints}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Active Campaigns */}
      {campaigns.filter((c: any) => c.status === 'active').length > 0 && (
        <div className="px-5 mb-6">
          <p className="ios-subheader">Active Campaigns</p>
          {campaigns.filter((c: any) => c.status === 'active').map((camp: any) => (
            <div key={camp.id} className="ios-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[17px] font-semibold">{camp.name}</p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
                  <span className="ios-badge ios-badge-green">Live</span>
                </div>
              </div>
              <div className="h-2 bg-[#E5E5EA] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#34C759] to-[#30D158] rounded-full"
                  style={{ width: `${camp.progress ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[13px] text-[#8E8E93]">
                <span>{camp.callsMade ?? 0} calls made</span>
                <span>{camp.totalLeads ?? 0} total leads</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
