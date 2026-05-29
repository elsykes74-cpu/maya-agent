import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { ChevronLeft, Shield, Plus, Phone, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import ConfirmSheet from '@/components/ConfirmSheet';

export default function DNCLists() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [phoneInput, setPhoneInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const { data } = trpc.dnc.list.useQuery({});
  const dncEntries = data?.items ?? [];

  const addMutation = trpc.dnc.add.useMutation({
    onSuccess: () => { utils.dnc.list.invalidate(); setPhoneInput(''); setShowAdd(false); },
  });

  const removeMutation = trpc.dnc.remove.useMutation({
    onSuccess: () => { utils.dnc.list.invalidate(); setRemoveId(null); },
  });

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <div className="flex-1">
            <h1 className="text-[22px] font-bold">Do Not Call</h1>
            <p className="text-[13px] text-[#8E8E93]">{dncEntries.length} numbers on list</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white">
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="px-5 mb-4">
        <div className="ios-card p-4 bg-gradient-to-r from-[#FF3B30]/10 to-transparent">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-[#FF3B30] mt-0.5" />
            <div>
              <p className="text-[15px] font-semibold text-[#1C1C1E]">TCPA Compliance</p>
              <p className="text-[13px] text-[#8E8E93] mt-1">Numbers on this list are automatically scrubbed before every campaign. These leads will never be called by your AI agent.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-2">
        {dncEntries.length === 0 && (
          <div className="py-16 text-center">
            <Shield size={40} className="mx-auto text-[#C6C6C8]" />
            <p className="text-[17px] text-[#8E8E93] mt-3">No DNC numbers yet</p>
          </div>
        )}

        {dncEntries.map((entry: any) => (
          <div key={entry.id} className="ios-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFE5E5] flex items-center justify-center">
              <Phone size={16} className="text-[#FF3B30]" />
            </div>
            <div className="flex-1">
              <p className="text-[17px] font-semibold font-mono">{entry.phone}</p>
              <p className="text-[13px] text-[#8E8E93]">Added {new Date(entry.createdAt).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => setRemoveId(entry.id)}
              aria-label="Remove from DNC"
              className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
            >
              <Trash2 size={16} className="text-[#C6C6C8]" />
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAdd(false)} />
          <div className="bottom-sheet p-5 z-50">
            <div className="w-10 h-1 bg-[#C6C6C8] rounded-full mx-auto mb-5" />
            <h2 className="text-[22px] font-bold mb-4">Add DNC Number</h2>
            <div className="mb-4">
              <label className="text-[15px] font-medium mb-2 block">Phone Number</label>
              <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="(413) 555-0123" className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]" />
            </div>
            <button onClick={() => { if (phoneInput.trim()) addMutation.mutate({ phone: phoneInput.trim() }); }} disabled={!phoneInput.trim() || addMutation.isPending} className="w-full ios-btn ios-btn-red text-[18px] py-4 disabled:opacity-50">
              <Shield size={18} /> Add to DNC List
            </button>
            <button onClick={() => setShowAdd(false)} className="w-full mt-2 text-[17px] text-[#8E8E93] py-3 font-medium">Cancel</button>
          </div>
        </>
      )}

      {removeId !== null && (
        <ConfirmSheet
          title="Remove Number"
          message="Remove this number from the DNC list? They may be called again."
          confirmLabel="Remove"
          danger
          onConfirm={() => removeMutation.mutate({ id: removeId })}
          onCancel={() => setRemoveId(null)}
        />
      )}

      <div className="h-4" />
    </div>
  );
}
