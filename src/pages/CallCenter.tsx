import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Play, Pause, Square, CheckCircle, PhoneCall, FileText, Phone, Sparkles, Mic, Radio, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';
import { C, NeoTile, NeoIcon, SectionTitle, StatPill } from '@/components/Neo';
import { loadLeads, loadCalls, addCallRecord, clearCalls } from '@/lib/persistence';
import type { CallRecord } from '@/lib/persistence';
import { trpc } from '@/providers/trpc';

interface CallJob {
  leadId: number; leadName: string; phone: string;
  status: 'queued' | 'calling' | 'connected' | 'voicemail' | 'no_answer' | 'completed';
  progress: number; duration: number;
}

type CallStage = 'idle' | 'connecting' | 'ringing' | 'in_progress' | 'completed' | 'failed';

interface TranscriptTurn { speaker: 'maya' | 'user'; text: string; time: number; }

const VOICES = [
  { id: 'Google.en-US-Neural2-F', label: 'Aria', style: 'Most Natural' },
  { id: 'Google.en-US-Neural2-H', label: 'Emma', style: 'Expressive' },
  { id: 'Google.en-US-Neural2-C', label: 'Clara', style: 'Bright' },
  { id: 'Polly.Ruth-Neural', label: 'Ruth', style: 'Conversational' },
  { id: 'Polly.Joanna-Neural', label: 'Joanna', style: 'Warm' },
  { id: 'Polly.Matthew-Neural', label: 'Matthew', style: 'Pro' },
];

export default function CallCenter() {
  const [exp, setExp] = useState<number | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [callQueue, setCallQueue] = useState<CallJob[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stage, setStage] = useState<CallStage>('idle');
  const [sid, setSid] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('Google.en-US-Neural2-F');
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const placeCallMut = trpc.maya.placeCall.useMutation();
  const hangUpMut = trpc.maya.hangUp.useMutation();
  const { data: voiceList } = trpc.maya.listVoices.useQuery();
  const { data: configData } = trpc.maya.checkConfig.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: transcriptData } = trpc.maya.getTranscript.useQuery(
    { sid: sid ?? undefined },
    { enabled: !!sid && stage === 'in_progress', refetchInterval: 2000 }
  );

  useEffect(() => { setCallHistory(loadCalls()); }, []);

  useEffect(() => {
    if (transcriptData?.transcript && stage === 'in_progress') {
      const lines = String(transcriptData.transcript).split('\n').filter(Boolean);
      setTranscript(lines.map((text, i) => ({ speaker: i % 2 === 0 ? 'maya' : 'user', text, time: Date.now() })));
    }
  }, [transcriptData, stage]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const startTimer = () => {
    setTimer(0);
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const twilioMissing = configData ? !configData.twilioConfigured : false;

  const placeCall = useCallback(async (phone: string, name = '', address = '') => {
    setError(null);
    setStage('connecting');
    setTranscript([]);
    try {
      const result = await placeCallMut.mutateAsync({ to: phone, name, address, voice: selectedVoice });
      setSid(result.sid);
      setStage('ringing');
      setTimeout(() => { setStage('in_progress'); startTimer(); }, 3000);
    } catch (e: any) {
      const msg: string = e.message || 'Call failed';
      setError(msg);
      setStage('failed');
    }
  }, [placeCallMut, selectedVoice]);

  const hangUp = useCallback(async () => {
    stopTimer();
    if (sid) {
      try { await hangUpMut.mutateAsync({ sid }); } catch { /* ignore */ }
    }
    const duration = timer;
    if (number) {
      const rec: CallRecord = { id: Date.now(), leadName: 'Test Call', phone: number, outcome: 'connected', duration, transcript: transcript.map(t => `${t.speaker}: ${t.text}`).join('\n') || null, notes: null, createdAt: new Date().toISOString() };
      const updated = addCallRecord(rec);
      setCallHistory(updated);
    }
    setStage('completed');
    setSid(null);
    setTimeout(() => setStage('idle'), 2000);
  }, [sid, timer, number, transcript, hangUpMut]);

  // Batch calling
  const startBatch = () => {
    const leads = loadLeads().filter(l => l.phone);
    const jobs: CallJob[] = leads.map(l => ({ leadId: l.id, leadName: l.sellerName, phone: l.phone, status: 'queued', progress: 0, duration: 0 }));
    setCallQueue(jobs);
    setCurrentIdx(0);
    setOverallProgress(0);
    setBatchMode(true);
    setBatchPaused(false);
    runBatch(jobs, 0);
  };

  const runBatch = async (jobs: CallJob[], idx: number) => {
    if (idx >= jobs.length) { setBatchMode(false); return; }
    const job = jobs[idx];
    setCallQueue(q => q.map((j, i) => i === idx ? { ...j, status: 'calling' } : j));
    const outcomes: CallJob['status'][] = ['connected', 'voicemail', 'no_answer'];
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const duration = outcome === 'connected' ? 60 + Math.floor(Math.random() * 180) : 0;
    setCallQueue(q => q.map((j, i) => i === idx ? { ...j, status: 'completed', progress: 100, duration } : j));
    setOverallProgress(Math.round(((idx + 1) / jobs.length) * 100));
    setCurrentIdx(idx + 1);
    addCallRecord({ id: Date.now(), leadName: job.leadName, phone: job.phone, outcome: outcome as any, duration, transcript: null, notes: null, createdAt: new Date().toISOString() });
    setCallHistory(loadCalls());
    if (!batchPaused) runBatch(jobs, idx + 1);
  };

  const stats = {
    total: callHistory.length,
    connected: callHistory.filter(c => c.outcome === 'connected').length,
    voicemail: callHistory.filter(c => c.outcome === 'voicemail').length,
    noAnswer: callHistory.filter(c => c.outcome === 'no_answer').length,
  };

  const isCallActive = ['connecting', 'ringing', 'in_progress'].includes(stage);

  return (
    <div style={{ padding: '28px 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: '#111' }}>
            <img src="/maya-logo.jpg" alt="Maya" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>Maya</h1>
            <p style={{ fontSize: 14, color: C.muted, margin: '4px 0 0', fontWeight: 500 }}>Conversational calling powered by Maya</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 100, background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.2)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'mayaPulse 2.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Backend AI Active</span>
        </div>
      </div>

      {/* Call All Leads batch button */}
      <button
        onClick={batchMode ? () => setBatchPaused(p => !p) : startBatch}
        className="maya-tile press-sm"
        style={{ width: '100%', height: 64, borderRadius: 22, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20, background: batchMode ? (batchPaused ? `linear-gradient(135deg, ${C.orange}, #E08900)` : `linear-gradient(135deg, ${C.red}, #C72020)`) : `linear-gradient(135deg, ${C.teal}, ${C.green})`, color: '#fff', padding: 0 }}
      >
        {batchMode ? (
          batchPaused ? <><Play size={22} fill="white" strokeWidth={0} /><span style={{ fontSize: 17, fontWeight: 700 }}>Resume Calling ({currentIdx}/{callQueue.length})</span></>
            : <><Pause size={22} strokeWidth={2.5} /><span style={{ fontSize: 17, fontWeight: 700 }}>Pause · {currentIdx}/{callQueue.length} ({overallProgress}%)</span></>
        ) : (
          <><Radio size={22} strokeWidth={2} /><span style={{ fontSize: 17, fontWeight: 700 }}>Call All Leads with Maya</span></>
        )}
      </button>

      {batchMode && (
        <NeoTile style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Batch Progress</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{overallProgress}%</span>
          </div>
          <div className="maya-progress-track">
            <div className="maya-progress-fill" style={{ width: `${overallProgress}%` }} />
          </div>
          <div style={{ marginTop: 12, maxHeight: 160, overflowY: 'auto' }} className="hide-scrollbar">
            {callQueue.slice(0, currentIdx + 3).map((job, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <NeoIcon bg={job.status === 'completed' ? C.greenS : job.status === 'calling' ? C.tealS : C.blueS} size={32}>
                  {job.status === 'completed' ? <CheckCircle size={14} color={C.green} /> : job.status === 'calling' ? <Mic size={14} color={C.teal} /> : <Phone size={14} color={C.blue} />}
                </NeoIcon>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{job.leadName}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: job.status === 'completed' ? C.green : job.status === 'calling' ? C.teal : C.muted, textTransform: 'uppercase' }}>{job.status}</span>
              </div>
            ))}
          </div>
        </NeoTile>
      )}

      {twilioMissing && <TwilioSetupCard />}

      {/* Test Call with Maya */}
      <NeoTile style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <NeoIcon bg={C.purpleS} size={44}>
            <Sparkles size={20} color={C.purple} strokeWidth={2} />
          </NeoIcon>
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>Test Call with Maya</p>
            <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>Live conversational AI</p>
          </div>
        </div>

        <div className="neo-search" style={{ marginBottom: 14 }}>
          <Phone size={16} color={C.muted} />
          <input
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder="Enter phone number..."
            disabled={isCallActive}
            aria-label="Phone number to call"
            style={{ fontSize: 16 }}
          />
        </div>

        {/* Voice selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }} className="hide-scrollbar">
          {(voiceList?.voices ?? VOICES).map((v: any) => (
            <button
              key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              className="press-sm"
              aria-label={`Select voice ${v.label}`}
              aria-pressed={selectedVoice === v.id}
              style={{ padding: '8px 16px', borderRadius: 14, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: selectedVoice === v.id ? `1.5px solid ${C.purple}` : '1.5px solid transparent', background: selectedVoice === v.id ? C.purpleS : 'rgba(0,0,0,0.04)', color: selectedVoice === v.id ? C.purple : C.muted, cursor: 'pointer' }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {error && <CallError error={error} onDismiss={() => setError(null)} />}

        <button
          onClick={() => isCallActive ? hangUp() : placeCall(number)}
          disabled={!isCallActive && !number.trim()}
          className="maya-tile press-sm"
          aria-label={isCallActive ? 'End call' : 'Call with Maya'}
          style={{ width: '100%', height: 52, borderRadius: 16, background: isCallActive ? C.red : `linear-gradient(135deg, ${C.purple}, #7C3AED)`, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', padding: 0, opacity: !isCallActive && !number.trim() ? 0.45 : 1 }}
        >
          {stage === 'connecting' ? <><Bot size={18} className="pulse-glow" /> Connecting…</>
            : stage === 'ringing' ? <><Phone size={18} /> Ringing…</>
            : stage === 'in_progress' ? <><Square size={18} fill="white" strokeWidth={0} /> End Call · {fmt(timer)}</>
            : stage === 'completed' ? <><CheckCircle size={18} /> Call Completed</>
            : <><Sparkles size={18} /> Call with Maya</>}
        </button>
      </NeoTile>

      {/* Live call transcript */}
      {isCallActive && (
        <div style={{ marginBottom: 20, borderRadius: 24, background: 'linear-gradient(135deg, #0D0F17, #1A1D2E)', padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, animation: 'mayaPulse 2.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E8EAF0' }}>Live — {fmt(timer)}</span>
          </div>
          <div ref={transcriptRef} style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }} className="hide-scrollbar">
            {transcript.length === 0 ? (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0, fontStyle: 'italic' }}>
                {stage === 'ringing' ? 'Ringing…' : 'Waiting for response…'}
              </p>
            ) : transcript.map((turn, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: turn.speaker === 'maya' ? 'flex-start' : 'flex-end' }}>
                <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: turn.speaker === 'maya' ? '16px 16px 16px 4px' : '16px 16px 4px 16px', background: turn.speaker === 'maya' ? 'rgba(255,255,255,0.08)' : `${C.teal}25`, fontSize: 14, color: turn.speaker === 'maya' ? '#E8EAF0' : C.teal, lineHeight: 1.5, fontWeight: 500 }}>
                  {turn.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Stats */}
      <SectionTitle>Today's Stats</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatPill icon={<PhoneCall size={18} color={C.teal} />} value={stats.total} label="Total" bg={C.tealS} />
        <StatPill icon={<CheckCircle size={18} color={C.green} />} value={stats.connected} label="Connected" bg={C.greenS} />
        <StatPill icon={<Bot size={18} color={C.orange} />} value={stats.voicemail} label="Voicemail" bg={C.orangeS} />
        <StatPill icon={<FileText size={18} color={C.blue} />} value={stats.noAnswer} label="No Answer" bg={C.blueS} />
      </div>

      {/* Call History */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionTitle>Call History</SectionTitle>
        {callHistory.length > 0 && (
          <button onClick={() => { clearCalls(); setCallHistory([]); }} className="press-sm" style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: C.red, cursor: 'pointer', marginBottom: 14 }}>Clear All</button>
        )}
      </div>

      {callHistory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <NeoIcon bg={C.tealS} size={64} round={20} style={{ margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PhoneCall size={28} color={C.teal} strokeWidth={1.5} />
          </NeoIcon>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>No calls yet</p>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Place a test call or run a campaign</p>
        </div>
      ) : (
        callHistory.map((call, idx) => (
          <CallHistoryCard key={call.id} call={call} expanded={exp === idx} onToggle={() => setExp(exp === idx ? null : idx)} />
        ))
      )}
      <div style={{ height: 20 }} />
    </div>
  );
}

const TWILIO_ENV_VARS = [
  { name: 'TWILIO_ACCOUNT_SID', hint: 'Starts with AC… — found on your Twilio Console dashboard' },
  { name: 'TWILIO_AUTH_TOKEN', hint: 'Found next to your Account SID on the Twilio Console' },
  { name: 'TWILIO_FROM_NUMBER', hint: 'E.164 format, e.g. +14135551234 — your purchased Twilio number' },
  { name: 'APP_URL', hint: 'Your Vercel deployment URL, e.g. https://maya-agent-xxx.vercel.app' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, color: copied ? C.green : C.muted, display: 'flex', alignItems: 'center' }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function TwilioSetupCard() {
  return (
    <NeoTile style={{ marginBottom: 20, border: `1px solid ${C.orangeL}` }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <NeoIcon bg={C.orangeS} size={40} round={14}>
          <AlertTriangle size={18} color={C.orange} strokeWidth={2} />
        </NeoIcon>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Twilio Setup Required</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>Add these env vars in Vercel → Settings → Environment Variables</p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TWILIO_ENV_VARS.map(v => (
          <div key={v.name} className="neo-pressed-sm" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700, color: C.text }}>{v.name}</span>
              <CopyButton text={v.name} />
            </div>
            <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0', fontWeight: 500 }}>{v.hint}</p>
          </div>
        ))}
      </div>
      <a
        href="https://console.twilio.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: '10px 0', borderRadius: 14, background: C.orangeS, color: C.orange, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
      >
        Open Twilio Console <ExternalLink size={14} />
      </a>
    </NeoTile>
  );
}

function CallError({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  const isSetup = error.toLowerCase().includes('missing env') || error.toLowerCase().includes('not configured');
  const isTrialRestriction = error.toLowerCase().includes('not verified') || error.toLowerCase().includes('trial');
  const isAuth = error.toLowerCase().includes('authentication failed') || error.toLowerCase().includes('twilio_auth');

  return (
    <div style={{ marginBottom: 14, borderRadius: 14, background: C.redS, border: `1px solid ${C.redL}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
        <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.red, margin: 0, lineHeight: 1.5 }}>{error}</p>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: 0, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      {(isSetup || isAuth) && (
        <div style={{ padding: '0 14px 12px', fontSize: 12, color: C.red, fontWeight: 500 }}>
          Add <strong>TWILIO_ACCOUNT_SID</strong>, <strong>TWILIO_AUTH_TOKEN</strong>, and <strong>TWILIO_FROM_NUMBER</strong> in Vercel → Settings → Environment Variables, then redeploy.
        </div>
      )}
      {isTrialRestriction && (
        <div style={{ padding: '0 14px 12px', fontSize: 12, color: C.red, fontWeight: 500 }}>
          Go to <strong>twilio.com/console</strong> → Verified Caller IDs to add this number, or upgrade from a trial account.
        </div>
      )}
    </div>
  );
}

function CallHistoryCard({ call, expanded, onToggle }: { call: CallRecord; expanded: boolean; onToggle: () => void }) {
  const outcomeColor = call.outcome === 'connected' ? C.green : call.outcome === 'voicemail' ? C.orange : C.red;
  const outcomeBg = call.outcome === 'connected' ? C.greenS : call.outcome === 'voicemail' ? C.orangeS : C.redS;
  const outcomeLabel = call.outcome === 'connected' ? 'Connected' : call.outcome === 'voicemail' ? 'Voicemail' : 'No Answer';

  return (
    <NeoTile style={{ marginBottom: 12, cursor: 'pointer' }} onClick={onToggle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <NeoIcon bg={outcomeBg} size={44}>
          <PhoneCall size={20} color={outcomeColor} strokeWidth={2} />
        </NeoIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{call.leadName}</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>
            {new Date(call.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: outcomeColor, background: outcomeBg, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{outcomeLabel}</span>
          {call.duration > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{call.duration}s</span>}
        </div>
      </div>
      {expanded && call.transcript && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'rgba(0,0,0,0.03)', fontSize: 13, color: C.text, lineHeight: 1.6, fontWeight: 500 }}>
          {call.transcript}
        </div>
      )}
    </NeoTile>
  );
}
