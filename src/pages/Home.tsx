import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { PhoneCall, Users, Zap, Calendar, Flame, Upload, CheckCircle } from 'lucide-react';
import { LEADS, CALLS } from '@/data';
import { C, NeoTile, NeoIcon, SectionTitle, MotTag } from '@/components/Neo';
import { AgentTile } from '@/components/AgentTile';
import { MayaHeader, QuickActionBar } from '@/components/MayaHeader';
import type { AgentData } from '@/components/Neo';

const AGENTS: AgentData[] = [
  { id: 'instagram', title: 'Instagram', icon: 'Zap', iconColor: '#E4405F', iconBg: '#FCE4EC', status: 'online', count: 3 },
  { id: 'camera', title: 'Camera', icon: 'Camera', iconColor: '#7B61FF', iconBg: '#EDE9FE', status: 'online' },
  { id: 'leads', title: 'Lead Capture', icon: 'Users', iconColor: '#14B8A6', iconBg: '#F0FDF9', status: 'online', count: 2 },
  { id: 'whatsapp', title: 'WhatsApp', icon: 'MessageCircle', iconColor: '#25D366', iconBg: '#E8F5E9', status: 'busy', count: 12 },
  { id: 'facebook', title: 'Facebook', icon: 'TrendingUp', iconColor: '#1877F2', iconBg: '#E3F2FD', status: 'online' },
  { id: 'workflow', title: 'Workflows', icon: 'Workflow', iconColor: '#FF9F0A', iconBg: '#FFFBF0', status: 'paused', count: 5 },
  { id: 'messages', title: 'Messages', icon: 'Mail', iconColor: '#8B5CF6', iconBg: '#FAF5FF', status: 'online', count: 8 },
  { id: 'calls', title: 'Call Agent', icon: 'Phone', iconColor: '#34C759', iconBg: '#F0FFF5', status: 'online', count: 3 },
];

export default function Home() {
  const navigate = useNavigate();
  const [uploaded, setUploaded] = useState<{ name: string; count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hours = new Date().getHours();
  const greeting = hours < 12 ? 'Good Morning' : hours < 17 ? 'Good Afternoon' : 'Good Evening';
  const hot = LEADS.filter(l => l.motivationLevel === 'hot').length;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      setUploaded({ name: file.name, count: Math.max(lines.length - 1, 0) });
      setTimeout(() => setUploaded(null), 3000);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <MayaHeader greeting={greeting} title="Maya" subtitle="Your AI Agent Command Center" status="online" statusLabel="Agent Online" />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <KpiButton icon={<Users size={16} color={C.red} />} value={hot} label="Hot" onClick={() => navigate('/leads')} />
        <KpiButton icon={<PhoneCall size={16} color={C.teal} />} value={3} label="Calls" onClick={() => navigate('/calls')} />
        <KpiButton icon={<Zap size={16} color={C.orange} />} value={1} label="Active" onClick={() => navigate('/campaigns')} />
        <KpiButton icon={<Calendar size={16} color={C.purple} />} value={2} label="Appts" onClick={() => navigate('/appointments')} />
      </div>

      {/* Agent Hub */}
      <SectionTitle>Agent Hub</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
        {AGENTS.map((agent, i) => (
          <AgentTile key={agent.id} {...agent} className={`s-${Math.min(i + 1, 6)}`} onClick={() => {
            if (agent.id === 'calls') navigate('/calls');
            else if (agent.id === 'leads') navigate('/leads');
            else if (agent.id === 'messages') navigate('/sms');
            else if (agent.id === 'workflow') navigate('/ai-config');
            else if (agent.id === 'camera') navigate('/appointments');
          }} />
        ))}
      </div>

      {/* Upload Leads */}
      <SectionTitle>Data</SectionTitle>
      <input type="file" ref={fileRef} accept=".csv,.xlsx,.xls,.json" onChange={handleFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        className="maya-tile press-sm"
        aria-label="Upload leads from CSV or Excel"
        style={{ width: '100%', height: 64, borderRadius: 20, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24, background: `linear-gradient(135deg, ${C.blue}, ${C.teal})`, color: '#fff', padding: 0 }}
      >
        {uploaded ? (
          <><CheckCircle size={22} strokeWidth={2.5} /><span style={{ fontSize: 16, fontWeight: 700 }}>{uploaded.count} leads imported from {uploaded.name}</span></>
        ) : (
          <><Upload size={22} strokeWidth={2.5} /><span style={{ fontSize: 16, fontWeight: 700 }}>Upload Leads (CSV / Excel)</span></>
        )}
      </button>

      {/* Quick Actions */}
      <SectionTitle>Quick Actions</SectionTitle>
      <QuickActionBar actions={[
        { label: 'Call', icon: <PhoneCall size={18} color="#fff" />, bg: C.teal, onClick: () => navigate('/calls') },
        { label: 'Lead', icon: <Users size={18} color="#fff" />, bg: C.green, onClick: () => navigate('/leads') },
        { label: 'Campaign', icon: <Zap size={18} color="#fff" />, bg: C.orange, onClick: () => navigate('/campaigns') },
        { label: 'Schedule', icon: <Calendar size={18} color="#fff" />, bg: C.purple, onClick: () => navigate('/appointments') },
      ]} />

      {/* Recent Calls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Recent Calls</SectionTitle>
        <button onClick={() => navigate('/calls')} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.teal, cursor: 'pointer', marginBottom: 14 }}>See All</button>
      </div>
      <NeoTile style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {CALLS.slice(0, 3).map((c, i) => (
          <button key={c.id} onClick={() => navigate('/calls')} className="press-sm" aria-label={`Call from ${c.leadName}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: i < 2 ? '1px solid rgba(0,0,0,0.04)' : 'none', border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <NeoIcon bg={c.outcome === 'connected' ? C.greenS : c.outcome === 'voicemail' ? C.orangeS : C.redS} size={44}>
              <PhoneCall size={20} color={c.outcome === 'connected' ? C.green : c.outcome === 'voicemail' ? C.orange : C.red} strokeWidth={2} />
            </NeoIcon>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{c.leadName}</p>
              <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>
                {c.outcome === 'connected' ? 'Connected' : c.outcome === 'voicemail' ? 'Voicemail' : 'No Answer'} · {new Date(c.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tertiary }}>{c.duration}s</span>
          </button>
        ))}
      </NeoTile>

      {/* Hot Leads */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle icon={<Flame size={14} color={C.red} />}>Hot Leads</SectionTitle>
        <button onClick={() => navigate('/leads')} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.teal, cursor: 'pointer', marginBottom: 14 }}>See All</button>
      </div>
      {LEADS.filter(l => l.motivationLevel === 'hot').map(l => (
        <button key={l.id} onClick={() => navigate('/leads')} className="maya-tile press-sm" aria-label={l.sellerName} style={{ marginBottom: 12, padding: 18, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>{l.sellerName}</p>
              <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0', fontWeight: 500 }}>{l.propertyAddress}</p>
            </div>
            <MotTag level={l.motivationLevel} />
          </div>
          {l.keyPainPoints && (
            <div className="neo-pressed-sm" style={{ marginTop: 10, padding: 10 }}>
              <p style={{ fontSize: 12, color: C.red, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Motivation</p>
              <p style={{ fontSize: 14, color: C.text, margin: '2px 0 0', fontWeight: 500 }}>{l.keyPainPoints}</p>
            </div>
          )}
        </button>
      ))}

      {/* Live Campaign */}
      <SectionTitle>Live Campaign</SectionTitle>
      <button onClick={() => navigate('/campaigns')} className="maya-tile press-sm" style={{ padding: 18, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Springfield Motivated</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 0 3px rgba(52,199,89,0.25)`, animation: 'mayaPulse 2.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Live</span>
          </div>
        </div>
        <div className="maya-progress-track"><div className="maya-progress-fill" style={{ width: '68%' }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13, color: C.muted, fontWeight: 600 }}>
          <span>34 calls</span><span>50 leads</span>
        </div>
      </button>

      <div style={{ height: 20 }} />
    </div>
  );
}

function KpiButton({ icon, value, label, onClick }: { icon: React.ReactNode; value: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="neo-pressed-sm press-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px', gap: 4, border: 'none', cursor: 'pointer' }}>
      {icon}
      <p style={{ fontSize: 20, fontWeight: 800, color: '#1C1C1E', margin: 0, letterSpacing: '-0.5px' }}>{value}</p>
      <p style={{ fontSize: 11, color: '#8E8E93', margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    </button>
  );
}
