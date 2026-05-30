import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bot, Volume2, Globe } from 'lucide-react';
import { C, NeoTile, NeoIcon, NeoButton, BackBtn } from '@/components/Neo';

export default function AIConfig() {
  const navigate = useNavigate();
  const [voice, setVoice] = useState('alloy');
  const [lang, setLang] = useState('English');
  const [greeting, setGreeting] = useState(
    "Hello, this is your AI real estate assistant. I work with local investors who buy houses for cash, as-is, and can close in as little as 14 days. Do you have a few minutes to talk?"
  );

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>AI Agent Config</h1>
      </div>

      <NeoTile style={{ background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`, textAlign: 'center', color: '#fff', marginBottom: 24, padding: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Bot size={30} color="#fff" strokeWidth={1.5} />
        </div>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>AI Calling Agent</p>
        <p style={{ fontSize: 13, opacity: 0.65, margin: '6px 0 0', fontWeight: 500 }}>Western Massachusetts Real Estate</p>
      </NeoTile>

      <p className="maya-section-title">Voice</p>
      <NeoTile style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <NeoIcon bg={C.tealS} size={36} round={12} style={{ marginRight: 14 }}><Volume2 size={18} color={C.teal} strokeWidth={2} /></NeoIcon>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.text }}>Voice</span>
          <select value={voice} onChange={e => setVoice(e.target.value)} className="neo-select" aria-label="Select voice">
            <option value="alloy">Alloy (Neutral)</option>
            <option value="echo">Echo (Male)</option>
            <option value="nova">Nova (Female)</option>
            <option value="shimmer">Shimmer (Female)</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px' }}>
          <NeoIcon bg={C.purpleS} size={36} round={12} style={{ marginRight: 14 }}><Globe size={18} color={C.purple} strokeWidth={2} /></NeoIcon>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: C.text }}>Language</span>
          <select value={lang} onChange={e => setLang(e.target.value)} className="neo-select" aria-label="Select language">
            <option>English</option>
            <option>Spanish</option>
          </select>
        </div>
      </NeoTile>

      <p className="maya-section-title" style={{ marginTop: 24 }}>Greeting Script</p>
      <NeoTile>
        <textarea
          value={greeting}
          onChange={e => setGreeting(e.target.value)}
          rows={6}
          aria-label="Greeting script"
          style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, resize: 'none', background: 'transparent', color: C.text, lineHeight: 1.6, fontWeight: 500 }}
        />
      </NeoTile>

      <NeoButton style={{ marginTop: 24 }} onClick={() => {}}>Save Configuration</NeoButton>
      <div style={{ height: 20 }} />
    </div>
  );
}
