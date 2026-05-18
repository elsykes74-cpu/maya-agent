/**
 * Kimi → Maya Integration — seed-leads
 *
 * Import 10 Western MA distressed property owners from top_10_seller_targets.csv
 * into Maya's `leads` table.  Idempotent (safe to re-run).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import mysql from "mysql2/promise";
import "dotenv/config";

// ── Paths ──────────────────────────────────────────────────────────────────────
const CSV_PATH = resolve(join(homedir(), "kimi-inspect/top_10_seller_targets.csv"));

// ── DB ─────────────────────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL!;
const conn  = await mysql.createConnection(dbUrl);

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const hdr   = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < hdr.length && i < vals.length; i++) row[hdr[i]] = vals[i];
    return row;
  });
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else { q = false; }
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; continue; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

// ── Validate ───────────────────────────────────────────────────────────────────
if (!existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`);
  process.exit(1);
}

const rows = parseCSV(readFileSync(CSV_PATH, "utf-8"));
console.log(`Parsed ${rows.length} rows from CSV`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY: Record<string, { m: "hot" | "warm" | "cold"; s: string }> = {
  HIGHEST: { m: "hot",  s: "outreach" },
  HIGH:    { m: "hot",  s: "outreach" },
  MEDIUM:  { m: "warm", s: "outreach" },
  LOW:     { m: "cold", s: "lead"    },
};

// Build INSERT SQL as a plain string (concatenation avoids template-literal
// backtick conflicts).  Drizzle-friendly column names:
//   "condition" is a MySQL reserved word — must be wrapped in backticks.
//   "seller_name" and "property_address" are not reserved but are
//   snake_case with underscores — safe to backtick-quote consistently.
const SQL = [
  "INSERT INTO leads",
  "  (seller_name, phone, property_address, city, state, pipeline_stage,",
  "   motivation_level, notes, key_pain_points, call_count, sms_count,",
  "   occupancy_status, `condition`)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'owner_occupied', 'heavy_rehab')",
  "ON DUPLICATE KEY UPDATE",
  "  seller_name         = VALUES(seller_name),",
  "  pipeline_stage      = VALUES(pipeline_stage),",
  "  motivation_level    = VALUES(motivation_level),",
  "  notes               = VALUES(notes),",
  "  key_pain_points     = VALUES(key_pain_points),",
  "  updated_at          = NOW()",
].join("\n");

// ── Insert ─────────────────────────────────────────────────────────────────────
let nInsert = 0, nSkip = 0;

for (const row of rows) {
  const name     = (row["Owner"]    || "").trim();
  const address  = (row["Address"]  || "").trim();
  const city     = (row["City"]     || "").trim();
  const state    = (row["State"]    || "MA").trim();
  const debtAmt  = parseFloat(row["Delinquent_Amount"] || "0");
  const years    = parseInt(  row["Years_In_Tax_Title"] || "0", 10);
  const muni     = (row["Municipality"]       || "").trim();
  const muniPh   = (row["Municipality_Phone"] || "").trim();
  const priority = (row["Priority"]   || "MEDIUM").toUpperCase();
  const notes    = (row["Notes"]      || "").trim();
  const rank     = row["Rank"];

  if (!name || !address) { nSkip++; continue; }

  const { m: motivation, s: stage } = PRIORITY[priority] || { m: "warm" as const, s: "lead" };

  try {
    await conn.execute(SQL, [
      name, null, address, city, state, stage,
      motivation,
      `${muni} tax collector ${muniPh}. ${notes}`.replace(/  +/g, " ").trim(),
      `${debtAmt.toLocaleString()} delinquent / ${years} yr tax title`,
    ]);
    nInsert++;
  } catch (err: any) {
    console.error(`  ⚠️  #${rank} (${name}): ${err.message}`);
    nSkip++;
  }
}

await conn.end();
console.log(`\nDone. ${nInsert} rows written, ${nSkip} skipped.`);
