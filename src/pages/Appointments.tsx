import { trpc } from '@/providers/trpc';
import { Calendar, Clock, MapPin, User, ChevronLeft, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';

export default function Appointments() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'upcoming' | 'today' | 'past'>('today');

  const { data } = trpc.appointments.list.useQuery({});
  const appointments = data?.items ?? [];

  const filtered = appointments.filter((a: any) => {
    const d = new Date(a.scheduledDate);
    const now = new Date();
    if (filter === 'today') return d.toDateString() === now.toDateString();
    if (filter === 'upcoming') return d > now;
    return d < now;
  });

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-full">
      <div className="sticky top-0 bg-[#F2F2F7] z-10 px-5 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className="text-[22px] font-bold">Appointments</h1>
          <div className="flex-1" />
          <button className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white">
            <Plus size={20} />
          </button>
        </div>
        <p className="text-[15px] text-[#8E8E93] pl-11">{todayStr}</p>

        <div className="flex gap-2 mt-3 pl-11">
          {(['today', 'upcoming', 'past'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-full text-[15px] font-medium capitalize transition-all ${
                filter === tab ? 'bg-[#007AFF] text-white' : 'bg-white text-[#8E8E93]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-3 mt-3">
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <Calendar size={28} className="text-[#C6C6C8]" />
            </div>
            <p className="text-[17px] text-[#8E8E93] mt-3">No appointments</p>
          </div>
        )}

        {filtered.map((apt: any) => (
          <div key={apt.id} className="ios-card p-4">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex flex-col items-center justify-center text-white shrink-0">
                <span className="text-[20px] font-bold leading-none">
                  {new Date(apt.scheduledDate).getDate()}
                </span>
                <span className="text-[10px] uppercase">
                  {new Date(apt.scheduledDate).toLocaleDateString('en-US', { month: 'short' })}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[18px] font-bold text-[#1C1C1E]">{apt.title}</p>
                {apt.leadName && (
                  <p className="text-[15px] text-[#8E8E93] flex items-center gap-1 mt-1">
                    <User size={14} /> {apt.leadName}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[14px] text-[#8E8E93]">
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(apt.scheduledDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  {apt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={14} /> {apt.location}
                    </span>
                  )}
                </div>
                {apt.notes && (
                  <p className="text-[14px] text-[#8E8E93] mt-2 bg-[#F2F2F7] rounded-lg p-2">{apt.notes}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-4" />
    </div>
  );
}
