import { useState } from 'react';
import { ChevronLeft, Home, Wrench, DollarSign, Percent } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function DealAnalysis() {
  const navigate = useNavigate();
  const [arv, setArv] = useState('');
  const [repairs, setRepairs] = useState('');
  const [assignmentFee, setAssignmentFee] = useState('5000');
  const [percent, setPercent] = useState('70');

  const arvNum = parseFloat(arv) || 0;
  const repairsNum = parseFloat(repairs) || 0;
  const feeNum = parseFloat(assignmentFee) || 0;
  const pctNum = parseFloat(percent) || 70;

  const mao = (arvNum * (pctNum / 100)) - repairsNum - feeNum;
  const maxOffer = arvNum * (pctNum / 100);

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className="text-[22px] font-bold">Deal Calculator</h1>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className="ios-card p-5 text-center bg-gradient-to-br from-[#34C759] to-[#30B350]">
          <p className="text-[15px] text-white/80 font-medium">Maximum Allowable Offer</p>
          <p className="text-[42px] font-bold text-white mt-1">
            {arvNum > 0 ? `$${Math.floor(mao).toLocaleString()}` : '$0'}
          </p>
          <div className="flex justify-center gap-6 mt-3">
            <div className="text-center">
              <p className="text-[13px] text-white/70">ARV × {pctNum}%</p>
              <p className="text-[17px] font-semibold text-white">${Math.floor(maxOffer).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[13px] text-white/70">Your Profit</p>
              <p className="text-[17px] font-semibold text-white">${feeNum.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <p className="ios-subheader">Property Details</p>

        <InputField label="After Repair Value (ARV)" icon={<Home size={18} />} value={arv} onChange={setArv} prefix="$" placeholder="300,000" />
        <InputField label="Estimated Repairs" icon={<Wrench size={18} />} value={repairs} onChange={setRepairs} prefix="$" placeholder="25,000" />
        <InputField label="Assignment Fee" icon={<DollarSign size={18} />} value={assignmentFee} onChange={setAssignmentFee} prefix="$" placeholder="5,000" />
        <InputField label="Investor Margin" icon={<Percent size={18} />} value={percent} onChange={setPercent} suffix="%" placeholder="70" />

        {arvNum > 0 && (
          <div className="ios-card p-4 mt-4">
            <p className="text-[17px] font-bold mb-3">Deal Breakdown</p>
            <BreakdownRow label="After Repair Value" value={arvNum} />
            <BreakdownRow label={`Investor Purchase (${pctNum}%)`} value={-maxOffer} />
            <BreakdownRow label="Estimated Repairs" value={-repairsNum} />
            <BreakdownRow label="Assignment Fee" value={-feeNum} />
            <div className="border-t border-[#E5E5EA] mt-2 pt-2">
              <BreakdownRow label="MAO (Your Max Offer)" value={mao} highlight />
            </div>
          </div>
        )}
      </div>

      <div className="h-4" />
    </div>
  );
}

function InputField({ label, icon, value, onChange, prefix, suffix, placeholder }: {
  label: string; icon: React.ReactNode; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[15px] font-medium text-[#1C1C1E] mb-2 flex items-center gap-2">
        <span className="text-[#8E8E93]">{icon}</span> {label}
      </label>
      <div className="flex items-center h-14 bg-white rounded-xl px-4 shadow-sm">
        {prefix && <span className="text-[17px] text-[#8E8E93] mr-1">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[20px] font-semibold outline-none placeholder:text-[#C6C6C8]"
        />
        {suffix && <span className="text-[17px] text-[#8E8E93] ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, highlight }: {
  label: string; value: number; highlight?: boolean;
}) {
  const isPositive = value >= 0;
  return (
    <div className="flex justify-between py-1.5">
      <span className={`text-[15px] ${highlight ? 'font-bold text-[#1C1C1E]' : 'text-[#8E8E93]'}`}>{label}</span>
      <span className={`text-[15px] font-semibold ${highlight ? 'text-[#34C759]' : isPositive ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
        {isPositive ? '' : '-'}${Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}
