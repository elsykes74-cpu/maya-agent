import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  ChevronLeft, Bell, Moon, Globe, Shield, HelpCircle,
  Info, ChevronRight, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useNavigate } from 'react-router';

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="min-h-full">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className="text-[22px] font-bold">Settings</h1>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className="ios-card p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center text-white text-[24px] font-bold">
            {user?.name?.charAt(0) ?? 'U'}
          </div>
          <div className="flex-1">
            <p className="text-[20px] font-bold text-[#1C1C1E]">{user?.name ?? 'User'}</p>
            <p className="text-[15px] text-[#8E8E93]">{user?.email ?? 'No email'}</p>
            {(user as any)?.role && <p className="text-[13px] text-[#007AFF] mt-1 font-medium">{(user as any).role}</p>}
          </div>
        </div>
      </div>

      <div className="px-5 mb-5">
        <p className="ios-subheader">General</p>
        <div className="ios-list">
          <ToggleRow icon={<Bell size={18} />} label="Push Notifications" value={notifications} onToggle={() => setNotifications(!notifications)} />
          <ToggleRow icon={<Moon size={18} />} label="Dark Mode" value={darkMode} onToggle={() => setDarkMode(!darkMode)} last />
        </div>
      </div>

      <div className="px-5 mb-5">
        <p className="ios-subheader">Account</p>
        <div className="ios-list">
          <LinkRow icon={<Shield size={18} />} label="Privacy & Security" />
          <LinkRow icon={<Globe size={18} />} label="Language" detail="English" />
          <LinkRow icon={<HelpCircle size={18} />} label="Help & Support" last />
        </div>
      </div>

      <div className="px-5 mb-8">
        <div className="ios-list">
          <LinkRow icon={<Info size={18} />} label="About" detail="v2.0.1" last />
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}

function ToggleRow({ icon, label, value, onToggle, last }: {
  icon: React.ReactNode; label: string; value: boolean; onToggle: () => void; last?: boolean;
}) {
  return (
    <div className={`ios-list-item ${last ? '' : 'border-b border-[#E5E5EA]'}`}>
      <span className="text-[#007AFF]">{icon}</span>
      <span className="flex-1 text-[17px] text-[#1C1C1E]">{label}</span>
      <button onClick={onToggle}>
        {value ? <ToggleRight size={28} className="text-[#34C759]" /> : <ToggleLeft size={28} className="text-[#C6C6C8]" />}
      </button>
    </div>
  );
}

function LinkRow({ icon, label, detail, last }: {
  icon: React.ReactNode; label: string; detail?: string; last?: boolean;
}) {
  return (
    <div className={`ios-list-item ${last ? '' : 'border-b border-[#E5E5EA]'}`}>
      <span className="text-[#007AFF]">{icon}</span>
      <span className="flex-1 text-[17px] text-[#1C1C1E]">{label}</span>
      {detail && <span className="text-[15px] text-[#8E8E93] mr-1">{detail}</span>}
      <ChevronRight size={18} className="text-[#C6C6C8]" />
    </div>
  );
}
