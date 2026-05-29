import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { ChevronLeft, MessageSquare, Plus, Send, Clock, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function SMSSequences() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  const { data } = trpc.sms.listTemplates.useQuery({});
  const templates = data?.items ?? [];

  const createMutation = trpc.sms.createTemplate.useMutation({
    onSuccess: () => { utils.sms.listTemplates.invalidate(); setShowCreate(false); setName(''); setBody(''); },
  });

  const deleteMutation = trpc.sms.deleteTemplate.useMutation({
    onSuccess: () => utils.sms.listTemplates.invalidate(),
  });

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className="text-[22px] font-bold">SMS Templates</h1>
          <div className="flex-1" />
          <button onClick={() => setShowCreate(true)} className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white">
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="px-5 space-y-3">
        {templates.length === 0 && (
          <div className="py-16 text-center">
            <MessageSquare size={40} className="mx-auto text-[#C6C6C8]" />
            <p className="text-[17px] text-[#8E8E93] mt-3">No templates yet</p>
            <p className="text-[15px] text-[#C6C6C8] mt-1">Create your first SMS template</p>
          </div>
        )}

        {templates.map((tpl: any) => (
          <div key={tpl.id} className="ios-card overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[18px] font-bold text-[#1C1C1E]">{tpl.name}</p>
                <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate({ id: tpl.id }); }} className="w-8 h-8 flex items-center justify-center">
                  <Trash2 size={16} className="text-[#C6C6C8]" />
                </button>
              </div>
              <div className="bg-[#F2F2F7] rounded-xl p-3">
                <p className="text-[16px] text-[#1C1C1E] leading-relaxed">{tpl.body}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[13px] text-[#8E8E93]">
                <Clock size={12} />
                <span>Created {new Date(tpl.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCreate(false)} />
          <div className="bottom-sheet p-5 z-50">
            <div className="w-10 h-1 bg-[#C6C6C8] rounded-full mx-auto mb-5" />
            <h2 className="text-[22px] font-bold mb-4">New SMS Template</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[15px] font-medium mb-2 block">Template Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Initial Outreach" className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]" />
              </div>
              <div>
                <label className="text-[15px] font-medium mb-2 block">Message Body</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {{name}}, I'm interested in buying your property at {{address}}..." rows={4} className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none resize-none focus:ring-2 focus:ring-[#007AFF]" />
                <p className="text-[13px] text-[#8E8E93] mt-1">Use {'{{name}}'}, {'{{address}}'} for personalization</p>
              </div>
            </div>
            <button onClick={() => { if (name.trim() && body.trim()) createMutation.mutate({ name: name.trim(), body: body.trim() }); }} disabled={!name.trim() || !body.trim() || createMutation.isPending} className="w-full ios-btn ios-btn-primary text-[18px] py-4 disabled:opacity-50">
              <Send size={18} /> Save Template
            </button>
            <button onClick={() => setShowCreate(false)} className="w-full mt-2 text-[17px] text-[#8E8E93] py-3 font-medium">Cancel</button>
          </div>
        </>
      )}

      <div className="h-4" />
    </div>
  );
}
