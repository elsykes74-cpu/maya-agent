import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Bot, Save, RotateCcw, ChevronDown, ChevronUp, Mic2, Phone } from 'lucide-react';
import { C, NeoTile, NeoIcon, BackBtn } from '@/components/Neo';
import { trpc } from '@/providers/trpc';

interface Section {
  key: keyof ScriptFields;
  label: string;
  description: string;
  rows: number;
}

interface ScriptFields {
  systemPrompt: string;
  openerScript: string;
  discoveryQuestions: string;
  positioningScript: string;
  priceAnchorScript: string;
  closeScript: string;
  voicemailScript: string;
}

interface ConfigFields extends ScriptFields {
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsVoiceName: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
}

const SECTIONS: Section[] = [
  { key: 'systemPrompt', label: 'Maya\'s Persona & Rules', description: 'Core instructions defining who Maya is, her tone, compliance rules, and objectives.', rows: 12 },
  { key: 'openerScript', label: 'Opening Script', description: 'What Maya says when someone picks up. Use [Name] and [Street Address] as placeholders.', rows: 8 },
  { key: 'discoveryQuestions', label: 'Discovery Questions', description: 'Questions Maya uses to uncover motivation, condition, and timeline.', rows: 8 },
  { key: 'positioningScript', label: 'Positioning', description: 'How Maya positions the buyer group when the person shows interest.', rows: 5 },
  { key: 'priceAnchorScript', label: 'Price Conversation', description: 'How Maya handles price discussions without making guarantees.', rows: 6 },
  { key: 'closeScript', label: 'Closing / Appointment', description: 'How Maya asks for and locks in the walkthrough appointment.', rows: 6 },
  { key: 'voicemailScript', label: 'Voicemail Script', description: 'What Maya leaves when she reaches voicemail.', rows: 5 },
];

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12,
  padding: '12px 14px', fontSize: 13, background: 'rgba(0,0,0,0.02)',
  color: C.text, fontWeight: 500, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};

export default function AIConfig() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>('systemPrompt');
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<ConfigFields | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);

  const { isLoading, data, isError } = trpc.aiConfig.get.useQuery(undefined, { retry: 2 });

  useEffect(() => {
    if (data && !fields) {
      setConfigId((data as any).id);
      setFields({
        systemPrompt: (data as any).systemPrompt ?? '',
        openerScript: (data as any).openerScript ?? '',
        discoveryQuestions: (data as any).discoveryQuestions ?? '',
        positioningScript: (data as any).positioningScript ?? '',
        priceAnchorScript: (data as any).priceAnchorScript ?? '',
        closeScript: (data as any).closeScript ?? '',
        voicemailScript: (data as any).voicemailScript ?? '',
        elevenLabsApiKey: (data as any).elevenLabsApiKey ?? '',
        elevenLabsVoiceId: (data as any).elevenLabsVoiceId ?? '',
        elevenLabsVoiceName: (data as any).elevenLabsVoiceName ?? '',
        twilioAccountSid: (data as any).twilioAccountSid ?? '',
        twilioAuthToken: (data as any).twilioAuthToken ?? '',
        twilioFromNumber: (data as any).twilioFromNumber ?? '',
      });
    }
  }, [data]);

  const updateMut = trpc.aiConfig.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = () => {
    if (!fields || configId == null) return;
    updateMut.mutate({ id: configId, ...fields });
  };

  const setField = (key: keyof ConfigFields, val: string) => {
    setFields(f => f ? { ...f, [key]: val } : f);
  };

  if (isError) {
    return (
      <div style={{ padding: '28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <BackBtn onClick={() => navigate(-1)} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Maya's Script</h1>
        </div>
        <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: C.red, margin: '0 0 8px' }}>Could not load config</p>
          <p style={{ fontSize: 14, color: C.muted, fontWeight: 500, margin: 0 }}>
            The server is not responding. Check that your environment variables are set in Vercel and redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !fields) {
    return (
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <p style={{ color: C.muted, fontWeight: 600 }}>Loading config…</p>
      </div>
    );
  }

  const elActive = !!(fields.elevenLabsApiKey && fields.elevenLabsVoiceId);

  return (
    <div style={{ padding: '16px 20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BackBtn onClick={() => navigate(-1)} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.text, letterSpacing: '-0.02em' }}>Maya's Script</h1>
      </div>

      {/* Hero */}
      <NeoTile style={{ background: `linear-gradient(135deg, ${C.purple}, #4F46E5)`, textAlign: 'center', color: '#fff', marginBottom: 24, padding: 24 }}>
        <NeoIcon bg="rgba(255,255,255,0.2)" size={56} round={18} style={{ margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={26} color="#fff" strokeWidth={1.5} />
        </NeoIcon>
        <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Claude-Powered AI Brain</p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 0', fontWeight: 500 }}>Edit Maya's instructions below — changes take effect on the next call</p>
      </NeoTile>

      {/* ElevenLabs Voice */}
      <NeoTile style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <NeoIcon bg={elActive ? 'rgba(52,199,89,0.12)' : C.purpleS} size={40} round={14}>
            <Mic2 size={18} color={elActive ? C.green : C.purple} strokeWidth={2} />
          </NeoIcon>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>ElevenLabs Voice</p>
            <p style={{ fontSize: 12, color: elActive ? C.green : C.muted, margin: '2px 0 0', fontWeight: 600 }}>
              {elActive ? `Active · ${fields.elevenLabsVoiceName || 'Custom voice'}` : 'Not configured — using Google Neural2'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>Voice Name (label only)</p>
            <input
              value={fields.elevenLabsVoiceName}
              onChange={e => setField('elevenLabsVoiceName', e.target.value)}
              placeholder="e.g. Liz"
              style={inputStyle}
            />
          </div>
          <div>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>Voice ID</p>
            <input
              value={fields.elevenLabsVoiceId}
              onChange={e => setField('elevenLabsVoiceId', e.target.value)}
              placeholder="ElevenLabs voice ID"
              style={inputStyle}
            />
          </div>
          <div>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>API Key</p>
            <input
              value={fields.elevenLabsApiKey}
              onChange={e => setField('elevenLabsApiKey', e.target.value)}
              placeholder="ElevenLabs API key"
              type="password"
              style={inputStyle}
            />
          </div>
        </div>
      </NeoTile>

      {/* Twilio */}
      {(() => {
        const twActive = !!(fields.twilioAccountSid && fields.twilioAuthToken && fields.twilioFromNumber);
        return (
          <NeoTile style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <NeoIcon bg={twActive ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.1)'} size={40} round={14}>
                <Phone size={18} color={twActive ? C.green : C.red} strokeWidth={2} />
              </NeoIcon>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Twilio Calling</p>
                <p style={{ fontSize: 12, color: twActive ? C.green : C.red, margin: '2px 0 0', fontWeight: 600 }}>
                  {twActive ? 'Active · Ready to call' : 'Not configured — calls will not work'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>Account SID</p>
                <input value={fields.twilioAccountSid} onChange={e => setField('twilioAccountSid', e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>Auth Token</p>
                <input value={fields.twilioAuthToken} onChange={e => setField('twilioAuthToken', e.target.value)} placeholder="Auth token" type="password" style={inputStyle} />
              </div>
              <div>
                <p style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '0 0 4px' }}>From Number (your Twilio number)</p>
                <input value={fields.twilioFromNumber} onChange={e => setField('twilioFromNumber', e.target.value)} placeholder="+14135551234" style={inputStyle} />
              </div>
            </div>
          </NeoTile>
        );
      })()}

      {/* Script sections */}
      {SECTIONS.map((section) => {
        const isOpen = expanded === section.key;
        return (
          <NeoTile key={section.key} style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(isOpen ? null : section.key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{section.label}</p>
                {!isOpen && <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>{section.description}</p>}
              </div>
              {isOpen ? <ChevronUp size={18} color={C.muted} /> : <ChevronDown size={18} color={C.muted} />}
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 10px', fontWeight: 500 }}>{section.description}</p>
                <textarea
                  value={fields[section.key]}
                  onChange={e => setField(section.key, e.target.value)}
                  rows={section.rows}
                  style={{
                    width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12,
                    padding: '12px 14px', fontSize: 13, resize: 'vertical',
                    background: 'rgba(0,0,0,0.02)', color: C.text, lineHeight: 1.6,
                    fontWeight: 500, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </NeoTile>
        );
      })}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={updateMut.isPending}
        style={{
          width: '100%', height: 52, borderRadius: 16, marginTop: 8,
          background: saved ? `linear-gradient(135deg, ${C.green}, #28A745)` : `linear-gradient(135deg, ${C.purple}, #4F46E5)`,
          color: '#fff', border: 'none', fontSize: 16, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: updateMut.isPending ? 'wait' : 'pointer',
          transition: 'background 0.3s',
        }}
      >
        {saved ? <><RotateCcw size={18} /> Saved!</> : <><Save size={18} /> {updateMut.isPending ? 'Saving…' : 'Save Changes'}</>}
      </button>

      <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: '12px 0 0', fontWeight: 500 }}>
        Changes are saved to your database and used on the next call.
      </p>
      <div style={{ height: 20 }} />
    </div>
  );
}
