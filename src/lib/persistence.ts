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

const PHOTOS_KEY = 'maya_photos_v1';

export interface Photo {
  id: number;
  dataUrl: string;
  takenAt: string;
  label: string;
}

export function loadPhotos(): Photo[] {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function savePhotos(photos: Photo[]) {
  try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)); } catch { /* ignore */ }
}

export function addPhoto(photo: Omit<Photo, 'id'>): Photo {
  const photos = loadPhotos();
  const newPhoto = { ...photo, id: Date.now() };
  savePhotos([newPhoto, ...photos]);
  return newPhoto;
}

export function deletePhoto(id: number) {
  savePhotos(loadPhotos().filter(p => p.id !== id));
}

const CAMPAIGNS_KEY = 'maya_campaigns_v1';

export interface SequenceStep {
  day: number;
  channel: 'call' | 'sms';
  scriptKey: string;
}

export interface CampaignLead {
  leadId: number;
  leadName: string;
  phone: string;
  motivationLevel: string;
  status: 'pending' | 'connected' | 'voicemail' | 'no_answer' | 'converted' | 'dnc';
  currentStep: number;
  lastContactedAt: string | null;
}

export interface Campaign {
  id: number;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  motivationFilter: 'all' | 'hot' | 'warm' | 'cold';
  sequenceTemplate: string;
  sequence: SequenceStep[];
  leads: CampaignLead[];
  createdAt: string;
}

export function loadCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveCampaigns(campaigns: Campaign[]) {
  try { localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns)); } catch { /* ignore */ }
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
