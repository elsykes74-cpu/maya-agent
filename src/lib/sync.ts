import { mayaDB } from './maya-supabase';
import { saveLeads, loadLeads, saveLeadCallLogs, loadLeadCallLogs } from './persistence';
import type { Lead, LeadCallLog } from './persistence';

// ── Lead mapping ──────────────────────────────────────────────────

const DB_CONDITIONS = new Set(['light_rehab', 'medium_rehab', 'heavy_rehab', 'move_in_ready']);
const DB_MOTIVATIONS = new Set(['hot', 'warm', 'cold']);

function toRow(lead: Lead) {
  return {
    id: lead.id,
    seller_name: lead.sellerName,
    property_address: lead.propertyAddress,
    phone: lead.phone || '',
    email: lead.email || null,
    motivation_level: DB_MOTIVATIONS.has(lead.motivationLevel) ? lead.motivationLevel as 'hot' | 'warm' | 'cold' : 'cold',
    timeline: lead.timeline || null,
    asking_price: lead.askingPrice ? Number(lead.askingPrice) || null : null,
    arv: lead.arv ? Number(lead.arv) || null : null,
    estimated_repairs: lead.estimatedRepairs ? Number(lead.estimatedRepairs) || null : null,
    beds: lead.beds || null,
    baths: lead.baths ? Number(lead.baths) || null : null,
    condition: DB_CONDITIONS.has(lead.condition) ? lead.condition as 'light_rehab' | 'medium_rehab' | 'heavy_rehab' | 'move_in_ready' : null,
    key_pain_points: lead.keyPainPoints || null,
  };
}

function fromRow(r: Record<string, any>): Lead {
  return {
    id: r.id,
    sellerName: r.seller_name || '',
    propertyAddress: r.property_address || '',
    phone: r.phone || '',
    email: r.email || null,
    motivationLevel: r.motivation_level || 'cold',
    timeline: r.timeline || '',
    askingPrice: r.asking_price ? String(r.asking_price) : '',
    arv: r.arv ? String(r.arv) : '',
    estimatedRepairs: r.estimated_repairs ? String(r.estimated_repairs) : '',
    beds: r.beds || 0,
    baths: Number(r.baths) || 0,
    condition: r.condition || '',
    keyPainPoints: r.key_pain_points || '',
  };
}

// ── Leads ─────────────────────────────────────────────────────────

export async function pullLeads(): Promise<void> {
  try {
    const { data, error } = await mayaDB
      .from('leads')
      .select('id, seller_name, property_address, phone, email, motivation_level, timeline, asking_price, arv, estimated_repairs, beds, baths, condition, key_pain_points')
      .order('created_at', { ascending: false });
    if (error || !data?.length) return;
    const existing = loadLeads();
    const existingIds = new Set(existing.map(l => l.id));
    const toAdd = (data as Record<string, any>[]).map(fromRow).filter(l => !existingIds.has(l.id));
    if (toAdd.length) saveLeads([...existing, ...toAdd]);
  } catch { /* localStorage is the fallback */ }
}

export function pushLead(lead: Lead): void {
  mayaDB.from('leads').upsert(toRow(lead), { onConflict: 'id' })
    .then(({ error }) => { if (error) console.error('[sync] pushLead error:', error.message); })
    .catch((err) => console.error('[sync] pushLead exception:', err));
}

export async function pushAllLeads(): Promise<void> {
  const leads = loadLeads();
  if (!leads.length) return;
  try {
    const { error } = await mayaDB.from('leads').upsert(leads.map(toRow), { onConflict: 'id' });
    if (error) console.error('[sync] pushAllLeads error:', error.message);
  } catch (err) {
    console.error('[sync] pushAllLeads exception:', err);
  }
}

export function pushLeadDelete(id: number): void {
  mayaDB.from('leads').delete().eq('id', id).then(() => {}).catch(() => {});
}

// ── Call logs ─────────────────────────────────────────────────────

export async function pullCallLogs(): Promise<void> {
  try {
    const { data, error } = await mayaDB
      .from('lead_call_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data?.length) return;
    const existing = loadLeadCallLogs();
    const existingIds = new Set(existing.map(l => l.id));
    const toAdd: LeadCallLog[] = (data as Record<string, any>[])
      .filter(r => !existingIds.has(r.id))
      .map(r => ({
        id: r.id,
        leadId: r.lead_id || 0,
        leadName: r.lead_name || '',
        phone: r.phone || '',
        outcome: r.outcome as LeadCallLog['outcome'],
        notes: r.notes || '',
        duration: r.duration || 0,
        campaignAssigned: r.campaign_assigned || null,
        createdAt: r.created_at,
      }));
    if (toAdd.length) saveLeadCallLogs([...existing, ...toAdd]);
  } catch { /* silent */ }
}

export function pushCallLog(log: LeadCallLog): void {
  mayaDB.from('lead_call_logs').insert({
    id: log.id,
    lead_id: log.leadId || null,
    lead_name: log.leadName,
    phone: log.phone,
    outcome: log.outcome,
    notes: log.notes,
    duration: log.duration,
    campaign_assigned: log.campaignAssigned,
    created_at: log.createdAt,
  }).then(() => {}).catch(() => {});
}

// ── Analytics queries (Supabase-only data) ────────────────────────

export async function fetchPipelineStages(): Promise<Record<string, number>> {
  try {
    const { data } = await mayaDB
      .from('leads')
      .select('pipeline_stage');
    if (!data?.length) return {};
    const counts: Record<string, number> = {};
    for (const row of data as Record<string, any>[]) {
      const s = row.pipeline_stage || 'lead';
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

export async function fetchCallMetrics(): Promise<{ outcome: string; count: number }[]> {
  try {
    const { data } = await mayaDB
      .from('lead_call_logs')
      .select('outcome');
    if (!data?.length) return [];
    const counts: Record<string, number> = {};
    for (const row of data as Record<string, any>[]) {
      const o = row.outcome || 'other';
      counts[o] = (counts[o] || 0) + 1;
    }
    return Object.entries(counts).map(([outcome, count]) => ({ outcome, count }));
  } catch { return []; }
}

export async function fetchRecentActivity(limit = 20): Promise<LeadCallLog[]> {
  try {
    const { data } = await mayaDB
      .from('lead_call_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!data?.length) return [];
    return (data as Record<string, any>[]).map(r => ({
      id: r.id,
      leadId: r.lead_id || 0,
      leadName: r.lead_name || '',
      phone: r.phone || '',
      outcome: r.outcome as LeadCallLog['outcome'],
      notes: r.notes || '',
      duration: r.duration || 0,
      campaignAssigned: r.campaign_assigned || null,
      createdAt: r.created_at,
    }));
  } catch { return []; }
}
