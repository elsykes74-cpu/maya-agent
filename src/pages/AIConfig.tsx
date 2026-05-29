import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { ChevronLeft, Bot, Save, Volume2, Languages, Clock, Phone } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function AIConfig() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: config, isLoading } = trpc.callingConfig.get.useQuery();
  const [voiceName, setVoiceName] = useState(config?.voiceName ?? 'alloy');
  const [language, setLanguage] = useState(config?.language ?? 'English');
  const [greeting, setGreeting] = useState(config?.greetingScript ?? '');
  const [transferNumber, setTransferNumber] = useState(config?.transferNumber ?? '');
  const [maxDuration, setMaxDuration] = useState(config?.maxCallDuration?.toString() ?? '300');

  const updateMutation = trpc.callingConfig.update.useMutation({
    onSuccess: () => utils.callingConfig.get.invalidate(),
  });

  const handleSave = () => {
    updateMutation.mutate({
      voiceName,
      language,
      greetingScript: greeting,
      transferNumber: transferNumber || undefined,
      maxCallDuration: parseInt(maxDuration) || 300,
    });
  };

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className="text-[22px] font-bold">AI Agent Config</h1>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className="ios-card p-5 text-center bg-gradient-to-br from-[#007AFF] to-[#5856D6]">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Bot size={32} className="text-white" />
          </div>
          <p className="text-[18px] font-bold text-white">AI Calling Agent</p>
          <p className="text-[14px] text-white/70 mt-1">Western Massachusetts Real Estate</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-[#8E8E93] text-[17px]">Loading config...</div>
      ) : (
        <div className="px-5 space-y-5">
          <div>
            <p className="ios-subheader">Voice</p>
            <div className="ios-list">
              <div className="ios-list-item border-b border-[#E5E5EA]">
                <Volume2 size={18} className="text-[#007AFF]" />
                <span className="flex-1 text-[17px]">Voice</span>
                <select value={voiceName} onChange={e => setVoiceName(e.target.value)} className="bg-[#F2F2F7] rounded-lg px-3 py-1.5 text-[15px] outline-none">
                  <option value="alloy">Alloy (Neutral)</option>
                  <option value="echo">Echo (Male)</option>
                  <option value="fable">Fable (Male)</option>
                  <option value="onyx">Onyx (Male)</option>
                  <option value="nova">Nova (Female)</option>
                  <option value="shimmer">Shimmer (Female)</option>
                </select>
              </div>
              <div className="ios-list-item">
                <Languages size={18} className="text-[#007AFF]" />
                <span className="flex-1 text-[17px]">Language</span>
                <select value={language} onChange={e => setLanguage(e.target.value)} className="bg-[#F2F2F7] rounded-lg px-3 py-1.5 text-[15px] outline-none">
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Portuguese">Portuguese</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="ios-subheader">Call Settings</p>
            <div className="ios-list">
              <div className="ios-list-item border-b border-[#E5E5EA]">
                <Clock size={18} className="text-[#007AFF]" />
                <span className="flex-1 text-[17px]">Max Duration</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={maxDuration} onChange={e => setMaxDuration(e.target.value)} className="w-16 bg-[#F2F2F7] rounded-lg px-2 py-1 text-[15px] text-right outline-none" />
                  <span className="text-[15px] text-[#8E8E93]">sec</span>
                </div>
              </div>
              <div className="ios-list-item">
                <Phone size={18} className="text-[#007AFF]" />
                <span className="flex-1 text-[17px]">Transfer Number</span>
                <input type="tel" value={transferNumber} onChange={e => setTransferNumber(e.target.value)} placeholder="Optional" className="w-32 bg-[#F2F2F7] rounded-lg px-2 py-1 text-[15px] text-right outline-none" />
              </div>
            </div>
          </div>

          <div>
            <p className="ios-subheader">Greeting Script</p>
            <div className="ios-card p-4">
              <textarea value={greeting} onChange={e => setGreeting(e.target.value)} placeholder="Hello, this is [Name] with [Company]. I'm calling about your property..." rows={5} className="w-full bg-transparent text-[17px] outline-none resize-none placeholder:text-[#C6C6C8]" />
            </div>
          </div>

          <button onClick={handleSave} disabled={updateMutation.isPending} className="w-full ios-btn ios-btn-primary text-[18px] py-4 disabled:opacity-50">
            <Save size={20} /> {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </button>

          {updateMutation.isSuccess && (
            <p className="text-center text-[#34C759] text-[15px] font-medium">Configuration saved!</p>
          )}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
