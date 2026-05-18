/**
 * Maya × Kimi Integration — seed campaign + campaign_leads
 *
 * Creates "Western Mass Distressed Property Outreach" campaign and links
 * all 10 leads from top_10_seller_targets.csv.
 * Idempotent — safe to re-run.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import mysql from "mysql2/promise";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const CSV_PATH  = resolve(join(homedir(), "kimi-inspect/top_10_seller_targets.csv"));

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const hdr   = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row  = {};
    for (let i = 0; i < hdr.length && i < vals.length; i++) row[hdr[i]] = vals[i];
    return row;
  });
}
function splitLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else q = false; }
    else   { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; continue; } else cur += c; }
  }
  out.push(cur); return out;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL not set in .env"); process.exit(1); }
  if (!existsSync(CSV_PATH)) { console.error(`CSV not found: ${CSV_PATH}`); process.exit(1); }

  const conn  = await mysql.createConnection({ uri: dbUrl });
  const CNAME = "Western Mass Distressed Property Outreach";
  const CDESC = "Kimi agent — 10 Western MA distressed owners, Day 1-12 SMS/call cadence.";

  try {
    // 1. Create / update campaign
    const [res] = await conn.execute(
      "INSERT INTO campaigns" +
      "  (name, description, status, motivation_filter, stage_filter," +
      "   max_calls_per_lead, call_interval_hours, total_leads)" +
      " VALUES (?, ?, 'active', 'hot', 'outreach', 3, 48, 10)" +
      " ON DUPLICATE KEY UPDATE" +
      "   description      = VALUES(description)," +
      "   status           = 'active'," +
      "   total_leads      = VALUES(total_leads)",
      [CNAME, CDESC]
    );
    const campaignId = res.insertId || (await conn.query(
      "SELECT id FROM campaigns WHERE name = ? LIMIT 1", [CNAME]
    ))[0][0].id;
    console.log(`Campaign "${CNAME}" → id=${campaignId}`);

    // Build address → lead_id map from DB
    const rows       = parseCSV(readFileSync(CSV_PATH, "utf-8"));
    const csvAddrs   = rows.map(r => (r["Address"] || "").trim().toLowerCase());
    const ph         = csvAddrs.map(() => "?").join(",");
    const [dbLeads]  = await conn.execute(
      `SELECT id, property_address FROM leads WHERE LOWER(TRIM(property_address)) IN (${ph})`,
      csvAddrs
    );
    const addrMap = new Map(dbLeads.map(l => [(l.property_address || "").trim().toLowerCase(), l.id]));

    // 3. Link CSV leads → campaign_leads
    let linked = 0;
    for (const row of rows) {
      const addr    = (row["Address"] || "").trim().toLowerCase();
      const leadId  = addrMap.get(addr);
      if (!leadId) continue;
      await conn.execute(
        "INSERT INTO campaign_leads" +
        "  (campaign_id, lead_id, status, attempts, scrub_status)" +
        " VALUES (?, ?, 'pending', 0, 'pending')" +
        " ON DUPLICATE KEY UPDATE status = 'pending', attempts = 0",
        [campaignId, leadId]
      );
      linked++;
    }

    // 4. Summary
    const [[{ total }]] = await conn.execute(
      "SELECT COUNT(*) total FROM campaign_leads WHERE campaign_id = ?", [campaignId]
    );
    await conn.end();
    console.log(`Linked ${linked} leads — queue ready (${total} rows)`);
    console.log("Done.");
  } catch (err) { console.error(err); process.exit(1); }
}
main();
