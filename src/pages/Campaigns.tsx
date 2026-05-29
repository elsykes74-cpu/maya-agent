import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { Megaphone, Plus, Play, Pause, Trash2, Users, PhoneCall, CheckCircle } from 'lucide-react';
import { DEMO_CAMPAIGNS } from '@/data/demo';
import ConfirmSheet from '@/components/ConfirmSheet';

export default function Campaigns() {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.campaigns.list.useQuery({}, { retry: false });
  const campaigns = data?.items ?? DEMO_CAMPAIGNS;

  const createMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setShowCreate(false); },
  });
  const toggleMutation = trpc.campaigns.toggleStatus.useMutation({
    onSuccess: () => utils.campaigns.list.invalidate(),
  });
  const deleteMutation = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setDeleteId(null); },
  });

  const statusCounts = {
    active: campaigns.filter((c: any) => c.status === 'active').length,
    paused: campaigns.filter((c: any) => c.status === 'paused').length,
    completed: campaigns.filter((c: any) => c.status === 'completed').length,
  };

  return (
    <div className="min-h-full">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">Campaigns</h1>
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Create campaign"
            className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className="flex gap-3">
          <StatusCard count={statusCounts.active} label="Active" color="bg-[#34C759]" />
          <StatusCard count={statusCounts.paused} label="Paused" color="bg-[#FF9500]" />
          <StatusCard count={statusCounts.completed} label="Done" color="bg-[#007AFF]" />
        </div>
      </div>

      <div className="px-5 space-y-3">
        {isLoading && <div className="py-20 text-center text-[#8E8E93] text-[17px]">Loading campaigns...</div>}

        {!isLoading && campaigns.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#F2F2F7] flex items-center justify-center">
              <Megaphone size={36} className="text-[#C6C6C8]" />
            </div>
            <p className="text-[17px] text-[#8E8E93] mt-4">No campaigns yet</p>
            <button onClick={() => setShowCreate(true)} className="mt-3 ios-btn ios-btn-primary px-6 py-3 text-[16px]">
              <Plus size={16} /> Create Campaign
            </button>
          </div>
        )}

        {campaigns.map((camp: any) => (
          <div key={camp.id} className="ios-card overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-[20px] font-bold text-[#1C1C1E]">{camp.name}</p>
                  <p className="text-[15px] text-[#8E8E93] mt-0.5">{camp.description}</p>
                </div>
                <CampaignStatusBadge status={camp.status} />
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-[#8E8E93]">Progress</span>
                  <span className="font-semibold text-[#1C1C1E]">{camp.progress ?? 0}%</span>
                </div>
                <div className="h-3 bg-[#E5E5EA] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${camp.progress ?? 0}%`,
                      background: camp.status === 'active'
                        ? 'linear-gradient(90deg, #34C759, #30D158)'
                        : camp.status === 'paused' ? '#FF9500' : '#007AFF',
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-4 mb-3">
                <div className="flex items-center gap-2 text-[14px] text-[#8E8E93]">
                  <Users size={16} /><span>{camp.totalLeads ?? 0} leads</span>
                </div>
                <div className="flex items-center gap-2 text-[14px] text-[#8E8E93]">
                  <PhoneCall size={16} /><span>{camp.callsMade ?? 0} called</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleMutation.mutate({ id: camp.id })}
                  className={`ios-btn flex-1 text-[16px] py-3 ${
                    camp.status === 'active' ? 'ios-btn-orange' : camp.status === 'paused' ? 'ios-btn-green' : 'ios-btn-gray'
                  }`}
                >
                  {camp.status === 'active'
                    ? <><Pause size={18} /> Pause</>
                    : camp.status === 'paused'
                    ? <><Play size={18} /> Resume</>
                    : <><CheckCircle size={18} /> Completed</>}
                </button>
                <button
                  onClick={() => setDeleteId(camp.id)}
                  aria-label="Delete campaign"
                  className="ios-btn ios-btn-gray px-4"
                >
                  <Trash2 size={18} className="text-[#FF3B30]" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateCampaignSheet
          onClose={() => setShowCreate(false)}
          onCreate={(d) => createMutation.mutate(d)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {deleteId !== null && (
        <ConfirmSheet
          title="Delete Campaign"
          message="This will permanently delete the campaign and all its data."
          confirmLabel="Delete Campaign"
          danger
          onConfirm={() => deleteMutation.mutate({ id: deleteId })}
          onCancel={() => setDeleteId(null)}
        />
      )}

      <div className="h-4" />
    </div>
  );
}

function StatusCard({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="flex-1 ios-card p-3 text-center">
      <div className={`w-3 h-3 rounded-full ${color} mx-auto mb-1`} />
      <p className="text-[24px] font-bold text-[#1C1C1E]">{count}</p>
      <p className="text-[12px] text-[#8E8E93]">{label}</p>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  if (status === 'active') return <span className="ios-badge ios-badge-green">Active</span>;
  if (status === 'paused') return <span className="ios-badge ios-badge-warm">Paused</span>;
  return <span className="ios-badge ios-badge-blue">Completed</span>;
}

function CreateCampaignSheet({
  onClose,
  onCreate,
  isSubmitting,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; description: string }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="bottom-sheet p-5 z-50">
        <div className="w-10 h-1 bg-[#C6C6C8] rounded-full mx-auto mb-5" />
        <h2 className="text-[22px] font-bold mb-4">New Campaign</h2>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-[15px] font-medium mb-2 block">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Springfield Motivated Sellers"
              className="w-full h-12 bg-[#F2F2F7] rounded-xl px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
          <div>
            <label className="text-[15px] font-medium mb-2 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this campaign for?"
              rows={3}
              className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none resize-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>
        </div>
        <button
          onClick={() => name.trim() && onCreate({ name: name.trim(), description: description.trim() })}
          disabled={!name.trim() || isSubmitting}
          className="w-full ios-btn ios-btn-primary text-[18px] py-4 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create Campaign'}
        </button>
        <button onClick={onClose} className="w-full mt-2 text-[17px] text-[#8E8E93] py-3 font-medium">
          Cancel
        </button>
      </div>
    </>
  );
}
