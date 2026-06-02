import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Bot, Save, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { C, NeoTile, NeoIcon, BackBtn } from '@/components/Neo';
import { trpc } from '@/providers/trpc';

interface Section {
  key: keyof ConfigFields;
  label: string;
  description: string;
  rows: number;
}

interface ConfigFields {
  systemPrompt: string;
  openerScript: string;
  discoveryQuestions: string;
  positioningScript: string;
  priceAnchorScript: string;
  closeScript: string;
  voicemailScript: string;
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

export default function AIConfig() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>('systemPrompt');
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<ConfigFields | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);

  const { isLoading } = trpc.aiConfig.get.useQuery(undefined, {
    onSuccess: (data: any) => {
      if (data && !fields) {
        setConfigId(data.id);
        setFields({
          systemPrompt: data.systemPrompt ?? '',
          openerScript: data.openerScript ?? '',
          discoveryQuestions: data.discoveryQuestions ?? '',
          positioningScript: data.positioningScript ?? '',
          priceAnchorScript: data.priceAnchorScript ?? '',
          closeScript: data.closeScript ?? '',
          voicemailScript: data.voicemailScript ?? '',
        });
      }
    },
  });

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

  if (isLoading || !fields) {
    return (
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <p style={{ color: C.muted, fontWeight: 600 }}>Loading config…</p>
      </div>
    );
  }

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
        disabled={updateMut.isLoading}
        style={{
          width: '100%', height: 52, borderRadius: 16, marginTop: 8,
          background: saved ? `linear-gradient(135deg, ${C.green}, #28A745)` : `linear-gradient(135deg, ${C.purple}, #4F46E5)`,
          color: '#fff', border: 'none', fontSize: 16, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: updateMut.isLoading ? 'wait' : 'pointer',
          transition: 'background 0.3s',
        }}
      >
        {saved ? <><RotateCcw size={18} /> Saved!</> : <><Save size={18} /> {updateMut.isLoading ? 'Saving…' : 'Save Changes'}</>}
      </button>

      <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: '12px 0 0', fontWeight: 500 }}>
        Changes are saved to your database and used on the next call.
      </p>
      <div style={{ height: 20 }} />
    </div>
  );
}
