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
  leadId?: number;
  leadName: string;
  phone: string;
  outcome: 'connected' | 'voicemail' | 'no_answer' | 'failed';
  duration: number;
  transcript: string | null;
  notes: string | null;
  createdAt: string;
  scriptUsed?: string;
  callSid?: string;
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

// ── Per-lead call logs ────────────────────────────────────────────

export type CallOutcome =
  | 'voicemail'
  | 'connected_interested'
  | 'connected_not_interested'
  | 'callback_requested'
  | 'no_answer'
  | 'hung_up'
  | 'other';

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  voicemail:                 'Voicemail Left',
  connected_interested:      'Connected — Interested',
  connected_not_interested:  'Connected — Not Interested',
  callback_requested:        'Callback Requested',
  no_answer:                 'No Answer',
  hung_up:                   'Hung Up',
  other:                     'Other',
};

export const OUTCOME_TO_CAMPAIGN: Record<CallOutcome, string> = {
  voicemail:                'Voicemail Follow-up',
  connected_interested:     'Hot Lead Nurture',
  connected_not_interested: 'Not Interested — Cold Drip',
  callback_requested:       'Hot Lead Nurture',
  no_answer:                'No Answer Re-contact',
  hung_up:                  'Re-engagement',
  other:                    'Not Interested — Cold Drip',
};

export interface LeadCallLog {
  id: number;
  leadId: number;
  leadName: string;
  phone: string;
  outcome: CallOutcome;
  notes: string;
  duration: number;
  campaignAssigned: string | null;
  createdAt: string;
}

const LEAD_LOGS_KEY = 'maya_lead_call_logs_v1';

export function loadLeadCallLogs(): LeadCallLog[] {
  try {
    const raw = localStorage.getItem(LEAD_LOGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveLeadCallLogs(logs: LeadCallLog[]) {
  try { localStorage.setItem(LEAD_LOGS_KEY, JSON.stringify(logs)); } catch { /* ignore */ }
}

export function addLeadCallLog(log: Omit<LeadCallLog, 'id'>): LeadCallLog {
  const logs = loadLeadCallLogs();
  const newLog = { ...log, id: Date.now() };
  saveLeadCallLogs([newLog, ...logs]);
  return newLog;
}

export function getLeadCallLogs(leadId: number): LeadCallLog[] {
  return loadLeadCallLogs().filter(l => l.leadId === leadId);
}

// ── Photos ────────────────────────────────────────────────────────

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

// ── Campaigns ─────────────────────────────────────────────────────

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
  status: 'pending' | 'connected' | 'voicemail' | 'no_answer' | 'converted' | 'dnc' | 'not_interested' | 'callback';
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
  isSystemDrip?: boolean;
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

// Pre-built outcome-based drip campaigns seeded automatically
const DRIP_SEEDS: Omit<Campaign, 'id' | 'createdAt' | 'leads'>[] = [
  {
    name: 'Voicemail Follow-up',
    description: 'Auto-assigned after leaving a voicemail. SMS + call re-contact sequence.',
    status: 'active',
    motivationFilter: 'all',
    sequenceTemplate: 'warm_nurture',
    isSystemDrip: true,
    sequence: [
      { day: 1, channel: 'sms', scriptKey: 'voicemail_sms_1' },
      { day: 3, channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 7, channel: 'call', scriptKey: 'second_call' },
      { day: 14, channel: 'sms', scriptKey: 'final_sms' },
    ],
  },
  {
    name: 'Hot Lead Nurture',
    description: 'Auto-assigned when a lead is interested or requests a callback.',
    status: 'active',
    motivationFilter: 'hot',
    sequenceTemplate: 'quick_strike',
    isSystemDrip: true,
    sequence: [
      { day: 0, channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 1, channel: 'call', scriptKey: 'second_call' },
      { day: 3, channel: 'sms', scriptKey: 'follow_up_sms' },
    ],
  },
  {
    name: 'No Answer Re-contact',
    description: 'Auto-assigned after no answer. Attempts re-contact via SMS then call.',
    status: 'active',
    motivationFilter: 'all',
    sequenceTemplate: 'warm_nurture',
    isSystemDrip: true,
    sequence: [
      { day: 1, channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 2, channel: 'call', scriptKey: 'initial_offer' },
      { day: 5, channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 10, channel: 'sms', scriptKey: 'final_sms' },
    ],
  },
  {
    name: 'Not Interested — Cold Drip',
    description: 'Long-term 30-day nurture for not interested or unresponsive leads.',
    status: 'active',
    motivationFilter: 'cold',
    sequenceTemplate: 'cold_drip',
    isSystemDrip: true,
    sequence: [
      { day: 7,  channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 14, channel: 'sms', scriptKey: 'second_call' },
      { day: 30, channel: 'sms', scriptKey: 'final_sms' },
    ],
  },
  {
    name: 'Re-engagement',
    description: 'Auto-assigned when a lead hung up. Gentle re-engagement over 10 days.',
    status: 'active',
    motivationFilter: 'all',
    sequenceTemplate: 'cold_drip',
    isSystemDrip: true,
    sequence: [
      { day: 3, channel: 'sms', scriptKey: 'follow_up_sms' },
      { day: 7, channel: 'sms', scriptKey: 'second_call' },
      { day: 10, channel: 'sms', scriptKey: 'final_sms' },
    ],
  },
];

export function seedDripCampaigns() {
  const existing = loadCampaigns();
  const existingNames = new Set(existing.map(c => c.name));
  const toAdd: Campaign[] = DRIP_SEEDS
    .filter(d => !existingNames.has(d.name))
    .map((d, i) => ({ ...d, id: Date.now() + i, leads: [], createdAt: new Date().toISOString() }));
  if (toAdd.length > 0) saveCampaigns([...existing, ...toAdd]);
}

export function assignLeadToCampaign(
  lead: { leadId: number; leadName: string; phone: string; motivationLevel: string },
  campaignName: string
) {
  seedDripCampaigns(); // ensure drip campaigns exist before assigning
  const campaigns = loadCampaigns();
  const campaign = campaigns.find(c => c.name === campaignName);
  if (!campaign) return;
  if (campaign.leads.some(l => l.leadId === lead.leadId)) return;
  campaign.leads.push({
    leadId: lead.leadId, leadName: lead.leadName, phone: lead.phone,
    motivationLevel: lead.motivationLevel, status: 'pending', currentStep: 0, lastContactedAt: null,
  });
  saveCampaigns(campaigns);
}

export function updateCampaignLeadStatus(
  campaignId: number,
  leadId: number,
  status: CampaignLead['status']
) {
  const campaigns = loadCampaigns();
  const camp = campaigns.find(c => c.id === campaignId);
  if (!camp) return;
  const lead = camp.leads.find(l => l.leadId === leadId);
  if (!lead) return;
  lead.status = status;
  lead.lastContactedAt = new Date().toISOString();
  saveCampaigns(campaigns);
}

// ── Appointments ──────────────────────────────────────────────────

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

// ── Audit trail ───────────────────────────────────────────────────

const AUDIT_KEY = 'maya_audit_v1';

export type AuditAction =
  | 'lead_added'
  | 'lead_updated'
  | 'lead_deleted'
  | 'call_logged'
  | 'campaign_assigned';

export interface AuditEntry {
  id: number;
  action: AuditAction;
  entityId: number;
  entityName: string;
  detail: string;
  createdAt: string;
}

export function loadAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveAudit(entries: AuditEntry[]) {
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(0, 500))); } catch { /* ignore */ }
}

export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'createdAt'>): void {
  const entries = loadAudit();
  entries.unshift({ ...entry, id: Date.now(), createdAt: new Date().toISOString() });
  saveAudit(entries);
}

// ── SkySlope transaction linkage ──────────────────────────────────

const SKYSLOPE_KEY = 'maya_skyslope_tx_v1';

export function getSkyslopeTransactionId(leadId: number): string | null {
  try {
    const raw = localStorage.getItem(SKYSLOPE_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, string>;
      return map[String(leadId)] ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

export function setSkyslopeTransactionId(leadId: number, saleGuid: string): void {
  try {
    const raw = localStorage.getItem(SKYSLOPE_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[String(leadId)] = saleGuid;
    localStorage.setItem(SKYSLOPE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}
