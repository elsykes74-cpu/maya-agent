/**
 * Kimi → Maya Integration
 *
 * Seeds the "Western Mass Distressed Property Outreach" campaign:
 *  - Creates a campaign row
 *  - Gets all 10 seeded leads by property_address
 *  - Links them via campaign_leads
 *
 * Usage:
 *   cd ~/Documents/maya-agent/app
 *   npx tsx scripts/seed-campaign.ts
 *
 * Requires: .env with DATABASE_URL
 */
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import "dotenv/config";
import mysql from "mysql2/promise";

const CSV_PATH   = resolve(join(__dirname, "../../kimi-inspect/top_10_seller_targets.csv"));
const CAMPAIGN_NAME = "Western Mass Distressed Property Outreach";
const CAMPAIGN_DESC = "Auto-imported from Kimi agent — 10 Western MA distressed property owners, Day 1–12 SMS/call cadence.";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌ DATABASE_URL not set. Add .env to maya-agent/app/ with your DB credentials.");
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

try {
  // ── 1. Create campaign ──────────────────────────────────────────────────────
  const [campaignResult] = await conn.execute(
    `INSERT INTO campaigns
       (name, description, status, motivation_filter, stage_filter,
        max_calls_per_lead, call_interval_hours, total_leads)
     VALUES (?, ?, 'active', 'hot', 'outreach', 3, 48, 10)
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       status      = 'active',
       total_leads = VALUES(total_leads)`,
    [CAMPAIGN_NAME, CAMPAIGN_DESC]
  );

  const campaignId = (campaignResult as any).insertId || (await (conn as any).query(
    "SELECT id FROM campaigns WHERE name = ? LIMIT 1", [CAMPAIGN_NAME]
  ) as any)[0][0].id;

  console.log(`📋 Campaign "${CAMPAIGN_NAME}" → id=${campaignId}`);

  // ── 2. Load leads from CSV ──────────────────────────────────────────────────
  const raw = readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const addresses = rows.map(r => (r["Address"] || "").trim().toLowerCase());

  // ── 3. Map CSV addresses → lead IDs in DB ───────────────────────────────────
  const [leadRows] = await conn.execute(
    `SELECT id, seller_name, property_address FROM leads
     WHERE LOWER(TRIM(property_address)) IN (?)`,
    [addresses]
  );
  const dbLeads = leadRows as any[];
  const addrToLeadId = new Map<string, number>();
  for (const l of dbLeads) {
    addrToLeadId.set((l.property_address || "").trim().toLowerCase(), l.id);
  }

  // ── 4. Link leads → campaign ────────────────────────────────────────────────
  let linked = 0;
  for (const row of rows) {
    const address = (row["Address"] || "").trim().toLowerCase();
    const leadId  = addrToLeadId.get(address);
    if (!leadId) continue;

    await conn.execute(
      `INSERT INTO campaign_leads (campaign_id, lead_id, status, attempts, scrub_status)
       VALUES (?, ?, 'pending', 0, 'pending')
       ON DUPLICATE KEY UPDATE status = 'pending', attempts = 0`,
      [campaignId, leadId]
    );
    linked++;
  }

  console.log(`🔗 Linked ${linked}/${rows.length} leads to campaign`);

  // ── Final summary ──────────────────────────────────────────────────────────
  const [[{ total }]] = await conn.execute(
    "SELECT COUNT(*) as total FROM campaign_leads WHERE campaign_id = ?", [campaignId]
  ) as any;
  console.log(`✅ Campaign complete — ${total} leads ready in call queue`);
} finally {
  await conn.end();
}
