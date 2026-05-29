import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import {
  PhoneCall, Bot, Play, Square, CheckCircle,
  Calendar, FileText, Headphones
} from 'lucide-react';
import { DEMO_CALLS } from '@/data/demo';

const DEMO_CONFIG = {
  voiceName: 'alloy', language: 'English', maxCallDuration: 300, transferNumber: '(413) 555-0199',
};

export default function CallCenter() {
  const [agentActive, setAgentActive] = useState(false);
  const [selectedCall, setSelectedCall] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: callsData } = trpc.calls.list.useQuery({}, { retry: false });
  const { data: configData } = trpc.callingConfig.get.useQuery({}, { retry: false });

  const calls = callsData?.items ?? DEMO_CALLS;
  const config = configData ?? DEMO_CONFIG;

  const stats = {
    answered: calls.filter((c: any) => c.outcome === 'connected').length,
    voicemail: calls.filter((c: any) => c.outcome === 'voicemail').length,
    noAnswer: calls.filter((c: any) => c.outcome === 'no_answer').length,
    total: calls.length,
  };

  return (
    <div className="min-h-full">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">AI Agent</h1>
        <p className="text-[15px] text-[#8E8E93] mt-1">Your 24/7 AI calling assistant</p>
      </div>

      <div className="px-5 mb-6">
        <div className={`ios-card p-5 ${agentActive ? 'ring-2 ring-[#34C759]' : ''}`}>
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${agentActive ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
              <Bot size={28} className={agentActive ? 'text-white' : 'text-[#8E8E93]'} />
            </div>
            <div className="flex-1">
              <p className="text-[20px] font-bold text-[#1C1C1E]">{agentActive ? 'AI Agent Online' : 'AI Agent Offline'}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${agentActive ? 'bg-[#34C759] animate-pulse' : 'bg-[#8E8E93]'}`} />
                <p className="text-[15px] text-[#8E8E93]">{agentActive ? 'Ready to take calls' : 'Activate to start calling'}</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAgentActive(!agentActive)}
            className={`w-full ios-btn text-[18px] py-4 ${agentActive ? 'ios-btn-red' : 'ios-btn-green'}`}
          >
            {agentActive ? <><Square size={20} /> Stop Agent</> : <><Play size={20} /> Activate AI Agent</>}
          </button>
        </div>
      </div>

      <div className="px-5 mb-6">
        <p className="ios-subheader">Today's Stats</p>
        <div className="grid grid-cols-4 gap-2">
          <StatPill icon={<CheckCircle size={16} />} value={stats.answered} label="Answered" color="text-[#34C759]" />
          <StatPill icon={<PhoneCall size={16} />} value={stats.voicemail} label="Voicemail" color="text-[#FF9500]" />
          <StatPill icon={<PhoneCall size={16} />} value={stats.noAnswer} label="No Answer" color="text-[#FF3B30]" />
          <StatPill icon={<FileText size={16} />} value={stats.total} label="Total" color="text-[#007AFF]" />
        </div>
      </div>

      <div className="px-5 mb-6">
        <p className="ios-subheader">How It Works</p>
        <div className="ios-card p-4 space-y-3">
          {[
            { step: 1, icon: <PhoneCall size={18} />, title: 'Lead Calls', desc: 'Inbound from signs, Zillow, website' },
            { step: 2, icon: <Bot size={18} />, title: 'AI Answers', desc: 'Instant professional greeting' },
            { step: 3, icon: <FileText size={18} />, title: 'Qualifies', desc: 'Budget, timeline, pre-approval' },
            { step: 4, icon: <Calendar size={18} />, title: 'Schedules', desc: 'Books showings into calendar' },
            { step: 5, icon: <Headphones size={18} />, title: 'Transfers', desc: 'Hot leads sent to you live' },
            { step: 6, icon: <CheckCircle size={18} />, title: 'Logs to CRM', desc: 'Full transcript synced' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E5F0FF] flex items-center justify-center text-[#007AFF] font-bold text-[13px] shrink-0">{item.step}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-[#1C1C1E]">{item.title}</p>
                <p className="text-[13px] text-[#8E8E93]">{item.desc}</p>
              </div>
              <span className="text-[#8E8E93]">{item.icon}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="ios-subheader !m-0">Call Transcripts</p>
          {calls.length > 5 && (
            <button onClick={() => setShowAll(v => !v)} className="text-[#007AFF] text-[15px] font-medium active:opacity-60">
              {showAll ? 'Show Less' : 'See All'}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {(showAll ? calls : calls.slice(0, 5)).map((call: any) => (
            <button key={call.id} onClick={() => setSelectedCall(selectedCall === call.id ? null : call.id)} className="w-full ios-card p-4 text-left">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${call.outcome === 'connected' ? 'bg-[#E5F9ED]' : call.outcome === 'voicemail' ? 'bg-[#FFF4E5]' : 'bg-[#FFE5E5]'}`}>
                  <PhoneCall size={16} className={call.outcome === 'connected' ? 'text-[#34C759]' : call.outcome === 'voicemail' ? 'text-[#FF9500]' : 'text-[#FF3B30]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-[#1C1C1E] truncate">{call.leadName || 'Unknown'}</p>
                  <p className="text-[13px] text-[#8E8E93]">
                    {call.outcome === 'connected' ? 'Connected' : call.outcome === 'voicemail' ? 'Left Voicemail' : 'No Answer'} · {call.duration}s
                  </p>
                </div>
                <OutcomeBadge outcome={call.outcome} />
              </div>

              {selectedCall === call.id && call.transcript && (
                <div className="mt-3 pt-3 border-t border-[#E5E5EA]">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[#007AFF] flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={12} className="text-white" />
                    </div>
                    <p className="text-[15px] text-[#1C1C1E] leading-relaxed">{call.transcript}</p>
                  </div>
                  {call.notes && (
                    <div className="flex items-start gap-2 mt-2 p-3 bg-[#F2F2F7] rounded-xl">
                      <FileText size={14} className="text-[#8E8E93] mt-0.5 shrink-0" />
                      <p className="text-[14px] text-[#8E8E93]">{call.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {config && (
        <div className="px-5 mb-6">
          <p className="ios-subheader">AI Configuration</p>
          <div className="ios-list">
            <ConfigRow label="Voice" value={config.voiceName || 'Default'} />
            <ConfigRow label="Language" value={config.language || 'English'} />
            <ConfigRow label="Max Duration" value={`${config.maxCallDuration || 300}s`} />
            <ConfigRow label="Transfer Number" value={config.transferNumber || 'Not set'} last />
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}

function StatPill({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center p-3 bg-white rounded-xl shadow-sm">
      <span className={color}>{icon}</span>
      <p className="text-[22px] font-bold text-[#1C1C1E] mt-1">{value}</p>
      <p className="text-[11px] text-[#8E8E93]">{label}</p>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === 'connected') return <span className="ios-badge ios-badge-green">Answered</span>;
  if (outcome === 'voicemail') return <span className="ios-badge ios-badge-warm">Voicemail</span>;
  return <span className="ios-badge ios-badge-cold">No Answer</span>;
}

function ConfigRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`ios-list-item ${last ? '' : 'border-b border-[#E5E5EA]'}`}>
      <span className="text-[17px] text-[#1C1C1E] flex-1">{label}</span>
      <span className="text-[17px] text-[#8E8E93]">{value}</span>
    </div>
  );
}
