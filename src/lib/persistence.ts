const LEADS_KEY = 'maya_leads_v3';
const CALLS_KEY = 'maya_calls_v3';
const APPTS_KEY = 'maya_appointments_v1';

export interface Lead {
  id: number;
  sellerName: string;
  propertyAddress: string;
  phone: string;
  email: string | null;
  motivationLevel: string;
  timeline: string;
  askingPrice: string;
  arv: string;
  estimatedRepairs: string;
  beds: number;
  baths: number;
  condition: string;
  keyPainPoints: string;
}

export interface CallRecord {
  id: number;
  leadName: string;
  phone: string;
  outcome: 'connected' | 'voicemail' | 'no_answer' | 'failed';
  duration: number;
  transcript: string | null;
  notes: string | null;
  createdAt: string;
  scriptUsed?: string;
}

export function loadLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(LEADS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveLeads(leads: Lead[]) {
  try { localStorage.setItem(LEADS_KEY, JSON.stringify(leads)); } catch { /* ignore */ }
}

export function loadCalls(): CallRecord[] {
  try {
    const raw = localStorage.getItem(CALLS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveCalls(calls: CallRecord[]) {
  try { localStorage.setItem(CALLS_KEY, JSON.stringify(calls)); } catch { /* ignore */ }
}

export function clearCalls() {
  saveCalls([]);
}

export interface Appointment {
  id: number;
  title: string;
  leadName: string;
  scheduledDate: string;
  location: string;
  notes?: string;
}

export function loadAppointments(): Appointment[] {
  try {
    const raw = localStorage.getItem(APPTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveAppointments(appts: Appointment[]) {
  try { localStorage.setItem(APPTS_KEY, JSON.stringify(appts)); } catch { /* ignore */ }
}

export function addCallRecord(call: CallRecord) {
  const calls = loadCalls();
  calls.unshift(call);
  saveCalls(calls);
  return calls;
}

let nextId = Date.now();
export function getNextId(): number {
  return ++nextId;
}
