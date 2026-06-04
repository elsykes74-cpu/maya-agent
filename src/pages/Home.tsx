import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PhoneCall, Users, Zap, Calendar, Flame, Upload, CheckCircle } from 'lucide-react';
import { C, NeoTile, NeoIcon, SectionTitle, MotTag } from '@/components/Neo';
import { AgentTile } from '@/components/AgentTile';
import { MayaHeader, QuickActionBar } from '@/components/MayaHeader';
import type { AgentData } from '@/components/Neo';
import { loadLeads, loadCalls, saveLeads, type Lead, type CallRecord } from '@/lib/persistence';

const AGENTS: AgentData[] = [
  { id: 'instagram', title: 'Instagram', icon: 'Instagram', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #E1306C 0%, #F77737 55%, #FCAF45 100%)', status: 'online', count: 3 },
  { id: 'camera', title: 'Camera', icon: 'Camera', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #8B5CF6 0%, #6D28D9 100%)', status: 'online' },
  { id: 'leads', title: 'Lead Capture', icon: 'Users', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #2DD4BF 0%, #14B8A6 50%, #0D9488 100%)', status: 'online' },
  { id: 'whatsapp', title: 'WhatsApp', icon: 'MessageCircle', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #25D366 0%, #128C7E 100%)', status: 'busy' },
  { id: 'facebook', title: 'Facebook', icon: 'Facebook', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #4F8EF7 0%, #1877F2 50%, #1251A6 100%)', status: 'online' },
  { id: 'workflow', title: 'Workflows', icon: 'Workflow', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #FFB340 0%, #FF9500 100%)', status: 'paused' },
  { id: 'messages', title: 'Messages', icon: 'Mail', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #BF5AF2 0%, #9333EA 50%, #7C3AED 100%)', status: 'online' },
  { id: 'calls', title: 'Call Agent', icon: 'Phone', iconColor: '#FFFFFF', iconBg: 'linear-gradient(145deg, #4CD964 0%, #34C759 50%, #28A745 100%)', status: 'online' },
];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseLeadsFromCSV(text: string): Lead[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, '').trim());

  const col = (cols: string[], ...keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h.includes(k));
      if (idx >= 0 && cols[idx]) return cols[idx].replace(/^["']|["']$/g, '').trim();
    }
    return '';
  };

  const leads: Lead[] = [];
  const baseId = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = col(cols, 'name', 'seller', 'owner', 'contact') || cols[0]?.trim() || '';
    if (!name) continue;

    const motRaw = col(cols, 'motivation', 'priority', 'level', 'status').toLowerCase();
    const motivationLevel = motRaw.includes('hot') || motRaw.includes('high') ? 'hot'
      : motRaw.includes('cold') || motRaw.includes('low') ? 'cold' : 'warm';

    leads.push({
      id: baseId + i,
      sellerName: name,
      phone: col(cols, 'phone', 'mobile', 'cell', 'number'),
      propertyAddress: col(cols, 'address', 'property', 'street', 'location'),
      email: col(cols, 'email', 'mail') || null,
      motivationLevel,
      timeline: col(cols, 'timeline', 'timeframe', 'when'),
      askingPrice: col(cols, 'asking', 'price', 'value'),
      arv: col(cols, 'arv', 'after repair'),
      estimatedRepairs: col(cols, 'repair', 'rehab', 'fix'),
      beds: parseInt(col(cols, 'bed', 'br', 'bedroom')) || 0,
      baths: parseInt(col(cols, 'bath', 'ba', 'bathroom')) || 0,
      condition: col(cols, 'condition', 'state'),
      keyPainPoints: col(cols, 'pain', 'notes', 'note', 'motivation', 'reason'),
    });
  }
  return leads;
}

export default function Home() {
  const navigate = useNavigate();
  const [uploaded, setUploaded] = useState<{ name: string; count: number } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const hours = new Date().getHours();
  const greeting = hours < 12 ? 'Good Morning' : hours < 17 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    setLeads(loadLeads());
    setCalls(loadCalls());
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const newLeads = parseLeadsFromCSV(text);
      if (newLeads.length > 0) {
        const merged = [...loadLeads(), ...newLeads];
        saveLeads(merged);
        setLeads(merged);
        setUploaded({ name: file.name, count: newLeads.length });
        setTimeout(() => setUploaded(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  const hot = leads.filter(l => l.motivationLevel === 'hot');
  const recentCalls = calls.slice(0, 3);

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <MayaHeader greeting={greeting} title="Maya" subtitle="Your AI Agent Command Center" status="online" statusLabel="Agent Online" branded />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <KpiButton value={hot.length} label="Hot" accentColor="#FF6B6B" darkColor="#FF3B30" onClick={() => navigate('/leads')} />
        <KpiButton value={calls.length} label="Calls" accentColor="#2DD4BF" darkColor="#0D9488" onClick={() => navigate('/calls')} />
        <KpiButton value={leads.length} label="Leads" accentColor="#FFB340" darkColor="#FF9500" onClick={() => navigate('/leads')} />
        <KpiButton value={0} label="Appts" accentColor="#A78BFA" darkColor="#7C3AED" onClick={() => navigate('/appointments')} />
      </div>

      {/* Agent Hub */}
      <SectionTitle>Agent Hub</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 24 }}>
        {AGENTS.map((agent, i) => (
          <div key={agent.id} className="neon-card">
            <AgentTile {...agent} className={`s-${Math.min(i + 1, 6)}`} onClick={() => {
              if (agent.id === 'calls') navigate('/calls');
              else if (agent.id === 'leads') navigate('/leads');
              else if (agent.id === 'messages') navigate('/sms');
              else if (agent.id === 'workflow') navigate('/ai-config');
              else if (agent.id === 'camera') navigate('/appointments');
              else if (agent.id === 'instagram') navigate('/leads');
              else if (agent.id === 'whatsapp') navigate('/sms');
              else if (agent.id === 'facebook') navigate('/campaigns');
            }} />
          </div>
        ))}
      </div>

      {/* Upload Leads */}
      <SectionTitle>Data</SectionTitle>
      <input type="file" ref={fileRef} accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        className="maya-tile press-sm"
        aria-label="Upload leads from CSV"
        style={{ width: '100%', height: 64, borderRadius: 20, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24, background: uploaded ? `linear-gradient(135deg, ${C.green}, #28A745)` : `linear-gradient(135deg, ${C.blue}, ${C.teal})`, color: '#fff', padding: 0, transition: 'background 0.3s' }}
      >
        {uploaded ? (
          <><CheckCircle size={22} strokeWidth={2.5} /><span style={{ fontSize: 16, fontWeight: 700 }}>{uploaded.count} leads imported from {uploaded.name}</span></>
        ) : (
          <><Upload size={22} strokeWidth={2.5} /><span style={{ fontSize: 16, fontWeight: 700 }}>Upload Leads (CSV)</span></>
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
      {recentCalls.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle>Recent Calls</SectionTitle>
            <button onClick={() => navigate('/calls')} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.teal, cursor: 'pointer', marginBottom: 14 }}>See All</button>
          </div>
          <NeoTile style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            {recentCalls.map((c, i) => (
              <button key={c.id} onClick={() => navigate('/calls')} className="press-sm" aria-label={`Call from ${c.leadName}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: i < recentCalls.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none', border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                <NeoIcon bg={c.outcome === 'connected' ? C.greenS : c.outcome === 'voicemail' ? C.orangeS : C.redS} size={44}>
                  <PhoneCall size={20} color={c.outcome === 'connected' ? C.green : c.outcome === 'voicemail' ? C.orange : C.red} strokeWidth={2} />
                </NeoIcon>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{c.leadName}</p>
                  <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>
                    {c.outcome === 'connected' ? 'Connected' : c.outcome === 'voicemail' ? 'Voicemail' : 'No Answer'} · {new Date(c.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {c.duration > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: C.tertiary }}>{c.duration}s</span>}
              </button>
            ))}
          </NeoTile>
        </>
      )}

      {/* Hot Leads */}
      {hot.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle icon={<Flame size={14} color={C.red} />}>Hot Leads</SectionTitle>
            <button onClick={() => navigate('/leads')} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.teal, cursor: 'pointer', marginBottom: 14 }}>See All</button>
          </div>
          {hot.slice(0, 3).map(l => (
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
        </>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

function KpiButton({ value, label, onClick, accentColor = '#14B8A6', darkColor = '' }: { value: number; label: string; onClick?: () => void; accentColor?: string; darkColor?: string }) {
  const endColor = darkColor || accentColor;
  return (
    <button
      onClick={onClick}
      className="maya-tile press-sm"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 12px', gap: 8, border: 'none', cursor: 'pointer', height: 104, borderRadius: 22 }}
    >
      <p style={{ fontSize: 10, color: C.muted, margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: `linear-gradient(145deg, ${accentColor} 0%, ${endColor} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 22px ${accentColor}55, 0 2px 6px ${accentColor}33, inset 0 1px 0 rgba(255,255,255,0.35)`, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 36% 28%, rgba(255,255,255,0.48) 0%, transparent 58%)', pointerEvents: 'none' }} />
        <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.5px', position: 'relative' }}>{value}</span>
      </div>
    </button>
  );
}
