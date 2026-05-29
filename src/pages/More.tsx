import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import {
  Calendar, TrendingUp, Settings, Shield, MessageSquare,
  Bot, ChevronRight, LogOut, User
} from 'lucide-react';

const MENU_ITEMS = [
  { icon: Calendar, label: 'Appointments', path: '/appointments', color: 'bg-[#AF52DE]' },
  { icon: TrendingUp, label: 'Deal Analysis', path: '/deals', color: 'bg-[#34C759]' },
  { icon: MessageSquare, label: 'SMS Sequences', path: '/sms', color: 'bg-[#5AC8FA]' },
  { icon: Shield, label: 'DNC Lists', path: '/dnc', color: 'bg-[#FF3B30]' },
  { icon: Bot, label: 'AI Agent Config', path: '/ai-config', color: 'bg-[#FF9500]' },
  { icon: Settings, label: 'Settings', path: '/settings', color: 'bg-[#8E8E93]' },
];

export default function More() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-full">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E]">More</h1>
      </div>

      <div className="px-5 mb-5">
        <div className="ios-card p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center text-white text-[20px] font-bold">
            {user?.name?.charAt(0) ?? 'U'}
          </div>
          <div className="flex-1">
            <p className="text-[20px] font-bold text-[#1C1C1E]">{user?.name ?? 'User'}</p>
            <p className="text-[15px] text-[#8E8E93]">{user?.email ?? 'No email'}</p>
          </div>
          <User size={20} className="text-[#C6C6C8]" />
        </div>
      </div>

      <div className="px-5 mb-6">
        <p className="ios-subheader">Tools</p>
        <div className="ios-list">
          {MENU_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`ios-list-item w-full text-left ${i < MENU_ITEMS.length - 1 ? 'border-b border-[#E5E5EA]' : ''}`}
              >
                <div className={`w-9 h-9 ${item.color} rounded-xl flex items-center justify-center text-white`}>
                  <Icon size={18} />
                </div>
                <span className="flex-1 text-[17px] text-[#1C1C1E]">{item.label}</span>
                <ChevronRight size={18} className="text-[#C6C6C8]" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 mb-8">
        <button onClick={logout} className="w-full ios-btn ios-btn-red text-[17px] py-4">
          <LogOut size={18} /> Sign Out
        </button>
      </div>

      <div className="h-4" />
    </div>
  );
}
