import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Phone, Bot, PhoneCall, PhoneMissed, PhoneOff,
  MessageSquare, Mail, MapPin, FileText, Calendar, DollarSign,
  AlertCircle, CheckCircle2, Clock, Sparkles, Plus, Send,
} from 'lucide-react';
import { C, NeoTile, NeoTileSm } from '@/components/Neo';
import { trpc } from '@/providers/trpc';

const ACTIVITY_ICON: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  call: { icon: <Phone size={14} strokeWidth={2.5} />, color: C.teal, bg: C.tealS },
  sms: { icon: <MessageSquare size={14} strokeWidth={2.5} />, color: C.blue, bg: C.blueS },
  email: { icon: <Mail size={14} strokeWidth={2.5} />, color: C.purple, bg: C.purpleS },
  note: { icon: <FileText size={14} strokeWidth={2.5} />, color: C.muted, bg: C.bg },
  visit: { icon: <MapPin size={14} strokeWidth={2.5} />, color: C.orange, bg: C.orangeS },
  offer: { icon: <DollarSign size={14} strokeWidth={2.5} />, color: C.green, bg: C.greenS },
  appointment: { icon: <Calendar size={14} strokeWidth={2.5} />, color: C.teal, bg: C.tealS },
  status_change: { icon: <AlertCircle size={14} strokeWidth={2.5} />, color: C.orange, bg: C.orangeS },
  system: { icon: <Sparkles size={14} strokeWidth={2.5} />, color: C.muted, bg: C.bg },
};

const TASK_ICON: Record<string, React.ReactNode> = {
  call_back: <PhoneCall size={14} strokeWidth={2.5} />,
  send_sms: <MessageSquare size={14} strokeWidth={2.5} />,
  send_email: <Mail size={14} strokeWidth={2.5} />,
  follow_up: <Clock size={14} strokeWidth={2.5} />,
  visit: <MapPin size={14} strokeWidth={2.5} />,
  contract: <FileText size={14} strokeWidth={2.5} />,
  other: <CheckCircle2 size={14} strokeWidth={2.5} />,
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDue(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  return new Date(d) <= new Date();
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leadId = parseInt(id ?? '', 10);
  const [noteText, setNoteText] = useState('');

  const leadQ = trpc.leads.getById.useQuery(
    { id: leadId },
    { enabled: !isNaN(leadId), retry: false }
  );
  const activitiesQ = trpc.activities.list.useQuery(
    { leadId, limit: 50 },
    { enabled: !isNaN(leadId) }
  );
  const tasksQ = trpc.tasks.list.useQuery(
    { leadId, status: 'pending' },
    { enabled: !isNaN(leadId) }
  );
  const addNote = trpc.activities.create.useMutation({
    onSuccess: () => {
      setNoteText('');
      activitiesQ.refetch();
    },
  });
  const completeTask = trpc.tasks.complete.useMutation({
    onSuccess: () => tasksQ.refetch(),
  });

  const lead = leadQ.data;
  const activities = activitiesQ.data?.items ?? [];
  const pendingTasks = tasksQ.data?.items ?? [];

  if (isNaN(leadId)) {
    return <div style={{ padding: 28, color: C.red }}>Invalid lead ID.</div>;
  }

  if (leadQ.isLoading) {
    return (
      <div style={{ padding: 28 }}>
        <button onClick={() => navigate('/leads')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.teal, fontWeight: 700, fontSize: 15, marginBottom: 24, padding: 0 }}>
          <ArrowLeft size={18} strokeWidth={2.5} /> Leads
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="neo-raised-sm" style={{ height: 72, borderRadius: 16 }} />)}
        </div>
      </div>
    );
  }

  if (leadQ.isError || !lead) {
    return (
      <div style={{ padding: 28 }}>
        <button onClick={() => navigate('/leads')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.teal, fontWeight: 700, fontSize: 15, marginBottom: 24, padding: 0 }}>
          <ArrowLeft size={18} strokeWidth={2.5} /> Leads
        </button>
        <NeoTile style={{ textAlign: 'center', padding: 40 }}>
          <PhoneOff size={40} color={C.muted} strokeWidth={1.5} style={{ margin: '0 auto 16px' }} />
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Lead #{leadId} not in CRM</p>
          <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            This lead hasn't been imported into Maya's CRM yet.<br />
            Leads added via the bot or import flow will appear here.
          </p>
        </NeoTile>
      </div>
    );
  }

  const pipelineColors: Record<string, string> = {
    new_lead: C.blue, outreach: C.teal, contacted: C.orange,
    appointment: C.green, under_contract: C.purple, closed: C.green,
    dead: C.muted, cold_drip: C.muted,
  };
  const pipelineColor = pipelineColors[lead.pipelineStage ?? 'new_lead'] ?? C.muted;

  return (
    <div style={{ padding: '28px 20px 48px' }}>
      {/* Back */}
      <button
        onClick={() => navigate('/leads')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.teal, fontWeight: 700, fontSize: 15, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={18} strokeWidth={2.5} /> Leads
      </button>

      {/* Header */}
      <NeoTile style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {lead.sellerName}
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
              <MapPin size={12} strokeWidth={2} /> {lead.propertyAddress}{lead.city ? `, ${lead.city}` : ''}
            </p>
          </div>
          {lead.appointmentSet && (
            <span style={{ background: C.greenS, color: C.green, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 10, whiteSpace: 'nowrap', marginLeft: 8 }}>
              🔥 Appt Set
            </span>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <StatChip label="Score" value={lead.leadScore ? `${lead.leadScore}/100` : '—'} color={C.purple} bg={C.purpleS} />
          <StatChip label="Calls" value={String(lead.callCount ?? 0)} color={C.teal} bg={C.tealS} />
          <StatChip
            label="Stage"
            value={(lead.pipelineStage ?? 'new').replace(/_/g, ' ')}
            color={pipelineColor}
            bg={`${pipelineColor}18`}
          />
        </div>

        {/* Call actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {lead.phone && (
            <a
              href={`tel:${lead.phone.replace(/\D/g, '')}`}
              style={{ flex: 1, height: 44, borderRadius: 14, background: C.teal, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', boxShadow: `0 4px 14px ${C.teal}30` }}
            >
              <Phone size={15} strokeWidth={2.5} /> Call
            </a>
          )}
          {lead.lastContactDate && (
            <div style={{ flex: 1, height: 44, borderRadius: 14, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Contact</span>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{fmtDateShort(lead.lastContactDate)}</span>
            </div>
          )}
        </div>
      </NeoTile>

      {/* Pending Tasks */}
      {(tasksQ.isLoading || pendingTasks.length > 0) && (
        <section style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px 4px' }}>
            Pending Tasks
          </h2>
          {tasksQ.isLoading ? (
            <div className="neo-raised-sm" style={{ height: 56, borderRadius: 14 }} />
          ) : (
            pendingTasks.map(task => (
              <NeoTileSm key={task.id} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: isDue(task.dueAt) ? C.redS : C.tealS, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDue(task.dueAt) ? C.red : C.teal, flexShrink: 0 }}>
                  {TASK_ICON[task.type] ?? <CheckCircle2 size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3 }}>{task.title}</p>
                  {task.dueAt && (
                    <p style={{ fontSize: 12, color: isDue(task.dueAt) ? C.red : C.muted, margin: '2px 0 0', fontWeight: 600 }}>
                      {isDue(task.dueAt) ? '⚠️ Overdue · ' : ''}{fmtDate(task.dueAt)}
                    </p>
                  )}
                  {task.notes && <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{task.notes}</p>}
                </div>
                <button
                  onClick={() => completeTask.mutate({ id: task.id })}
                  disabled={completeTask.isPending}
                  style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: C.greenS, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  aria-label="Mark task done"
                >
                  <CheckCircle2 size={16} strokeWidth={2.5} />
                </button>
              </NeoTileSm>
            ))
          )}
        </section>
      )}

      {/* Activity Timeline */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px 4px' }}>
          Activity Timeline
        </h2>

        {/* Add note */}
        <NeoTileSm style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            style={{ flex: 1, background: C.bg, border: 'none', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: C.text, resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <button
            onClick={() => {
              if (!noteText.trim()) return;
              addNote.mutate({ leadId, type: 'note', body: `📝 ${noteText.trim()}` });
            }}
            disabled={!noteText.trim() || addNote.isPending}
            style={{ width: 40, height: 40, borderRadius: 12, background: C.teal, border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !noteText.trim() ? 0.4 : 1, flexShrink: 0 }}
            aria-label="Add note"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </NeoTileSm>

        {activitiesQ.isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <div key={i} className="neo-raised-sm" style={{ height: 64, borderRadius: 14 }} />)}
          </div>
        )}

        {!activitiesQ.isLoading && activities.length === 0 && (
          <NeoTile style={{ textAlign: 'center', padding: 32 }}>
            <PhoneMissed size={32} color={C.muted} strokeWidth={1.5} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No activity yet</p>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Activity will appear here as the AI bot makes calls.</p>
          </NeoTile>
        )}

        {activities.map((a, idx) => {
          const meta = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.note;
          const parsed = a.metadata ? (() => { try { return JSON.parse(a.metadata); } catch { return {}; } })() : {};
          return (
            <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: idx < activities.length - 1 ? 2 : 0 }}>
              {/* Timeline line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 34, flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                {idx < activities.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 12, background: C.bg, margin: '4px 0' }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 2px', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {a.body}
                </p>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, fontWeight: 500 }}>
                  {fmtDate(a.createdAt)}
                </p>
                {parsed.recordingUrl && (
                  <a href={parsed.recordingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    🎙 Play Recording
                  </a>
                )}
                {parsed.transcript && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: 600 }}>View transcript</summary>
                    <p style={{ fontSize: 12, color: C.text, marginTop: 6, lineHeight: 1.6, background: C.bg, borderRadius: 10, padding: '8px 10px' }}>
                      {parsed.transcript}
                    </p>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatChip({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '8px 10px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 13, color, fontWeight: 800, margin: 0, textTransform: 'capitalize' }}>{value}</p>
    </div>
  );
}
