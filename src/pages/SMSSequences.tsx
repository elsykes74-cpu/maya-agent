import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Send, MessageSquare, Clock, CheckCircle, XCircle } from 'lucide-react';
import { C, NeoTile, NeoIcon, BackBtn } from '@/components/Neo';
import { trpc } from '@/providers/trpc';

const STATIC_TEMPLATES = [
  {
    name: 'Initial Outreach',
    day: 0,
    content: "Hi {name}, I'm a local investor interested in buying your property at {address} for cash. I can close in 14 days as-is. Would you be open to a quick conversation?",
  },
  {
    name: 'Follow Up',
    day: 2,
    content: "Hi {name}, following up on my message about your property. I have a cash offer ready — no repairs needed, no fees, close on your timeline. Can we talk for 5 minutes?",
  },
  {
    name: 'Second Follow-up',
    day: 5,
    content: "Hey {name}, just checking in one more time. We're still actively buying in your area and would love to make you an offer on your property. No obligation at all.",
  },
  {
    name: 'Final Message',
    day: 10,
    content: "Hi {name}, last message from me — if you ever decide to sell your property and want a fast, hassle-free cash offer, I'm here. Wishing you all the best!",
  },
];

const STATUS_COLOR: Record<string, string> = {
  sent: C.teal,
  delivered: C.green,
  failed: C.red,
  replied: C.blue,
};

export default function SMSSequences() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sendResult, setSendResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  const { data: templatesData } = trpc.sms.templates.useQuery(undefined, { retry: false });
  const { data: logsData } = trpc.sms.list.useQuery({ limit: 20 }, { retry: false });
  const sendMutation = trpc.sms.sendOne.useMutation();

  const templates = (templatesData && templatesData.length > 0) ? templatesData : STATIC_TEMPLATES;
  const logs = logsData?.items ?? [];

  async function handleSend() {
    if (!phone.trim() || !message.trim()) return;
    setSendResult(null);
    try {
      const result = await sendMutation.mutateAsync({ to: phone.trim(), body: message.trim() });
      if (result.error) {
        setSendResult({ error: result.error });
      } else {
        setSendResult({ ok: true });
        setPhone('');
        setMessage('');
      }
    } catch (e: any) {
      setSendResult({ error: e?.message ?? 'Send failed' });
    }
  }

  function useTemplate(content: string) {
    setMessage(content.replace(/{name}/g, '').replace(/{address}/g, '').trim());
  }

  const sending = sendMutation.isPending;

  return (
    <div style={{ padding: '16px 20px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>SMS</h1>
      </div>

      {/* Quick Send */}
      <NeoTile style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <NeoIcon bg={C.tealS} size={32} round={10}><Send size={15} color={C.teal} strokeWidth={2} /></NeoIcon>
          Quick Send
        </p>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Phone number"
          style={inputStyle}
        />
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Message…"
          rows={4}
          style={{ ...inputStyle, marginTop: 10, resize: 'none' }}
        />
        {sendResult && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: sendResult.ok ? C.green : C.red }}>
            {sendResult.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
            {sendResult.ok ? 'Message sent!' : sendResult.error}
          </div>
        )}
        <button
          onClick={handleSend}
          disabled={sending || !phone.trim() || !message.trim()}
          style={{ marginTop: 12, width: '100%', height: 48, borderRadius: 14, background: C.teal, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Send size={16} strokeWidth={2} />
          {sending ? 'Sending…' : 'Send SMS'}
        </button>
      </NeoTile>

      {/* Templates */}
      <p className="maya-section-title">Templates</p>
      {templates.map((t, i) => (
        <NeoTile key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NeoIcon bg={C.blueS} size={30} round={9}><MessageSquare size={14} color={C.blue} strokeWidth={2} /></NeoIcon>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>
              <Clock size={12} />Day {t.day}
            </div>
          </div>
          <div className="neo-pressed-sm" style={{ padding: 12, marginBottom: 10 }}>
            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{t.content}</p>
          </div>
          <button
            onClick={() => useTemplate(t.content)}
            style={{ width: '100%', height: 36, borderRadius: 10, background: C.blueS, color: C.blue, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Use Template
          </button>
        </NeoTile>
      ))}

      {/* Recent Log */}
      {logs.length > 0 && (
        <>
          <p className="maya-section-title" style={{ marginTop: 24 }}>Recent Messages</p>
          <NeoTile style={{ padding: 0, overflow: 'hidden' }}>
            {logs.map((log, i) => (
              <div key={log.id} style={{ padding: '12px 16px', borderBottom: i < logs.length - 1 ? `1px solid ${C.border ?? 'rgba(0,0,0,0.06)'}` : 'none', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLOR[log.status ?? 'sent'] ?? C.muted, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: C.text, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.direction === 'inbound' ? '← Reply' : '→ Outbound'} · Lead #{log.leadId}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.messageContent}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: C.tertiary ?? C.muted, fontWeight: 500, flexShrink: 0 }}>
                  {log.status}
                </span>
              </div>
            ))}
          </NeoTile>
        </>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid rgba(0,0,0,0.08)`,
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14,
  background: 'rgba(0,0,0,0.03)',
  color: C.text,
  fontWeight: 500,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
