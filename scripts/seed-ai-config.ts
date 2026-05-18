/**
 * Kimi → Maya Integration — seed-ai-config
 *
 * Seeds Maya's aiConfig table and objection_responses from Kimi's scripts.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import mysql from "mysql2/promise";

const __dirname  = resolve(import.meta.url, "..");
const AI_CONFIG  = resolve(__dirname, "maya-integration/kimi_ai_config.json");

async function main() {
  if (!existsSync(AI_CONFIG)) { console.error(`${AI_CONFIG} not found`); process.exit(1); }
  const cfg = JSON.parse(readFileSync(AI_CONFIG, "utf-8"));
  const dbUrl = process.env.DATABASE_URL!;
  if (!dbUrl) { console.error("DATABASE_URL not set in .env"); process.exit(1); }
  const conn = await mysql.createConnection({ uri: dbUrl });
  try {
    const [rows] = await conn.execute("SELECT id FROM ai_config LIMIT 1");
    if (rows.length > 0) {
      const id = rows[0].id;
      await conn.execute(
        "UPDATE ai_config SET" +
        " system_prompt         = ?," +
        " opener_script         = ?," +
        " discovery_questions   = ?," +
        " positioning_script    = ?," +
        " price_anchor_script   = ?," +
        " close_script          = ?," +
        " voicemail_script      = ?," +
        " compliance_disclaimer = ?," +
        " updated_at            = NOW()" +
        " WHERE id = ?",
        [cfg.system_prompt, cfg.opener_script, cfg.discovery_questions,
         cfg.positioning_script, cfg.price_anchor_script, cfg.close_script,
         cfg.voicemail_script, cfg.compliance_disclaimer, id]
      );
      console.log("Updated ai_config");
    } else {
      await conn.execute(
        "INSERT INTO ai_config" +
        " (system_prompt, opener_script, discovery_questions, positioning_script," +
        "  price_anchor_script, close_script, voicemail_script, compliance_disclaimer)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [cfg.system_prompt, cfg.opener_script, cfg.discovery_questions,
         cfg.positioning_script, cfg.price_anchor_script, cfg.close_script,
         cfg.voicemail_script, cfg.compliance_disclaimer]
      );
      console.log("Inserted ai_config");
    }

    const objections = [
      ["I'm not interested",
       "Totally fair — you didn't ask me to call. Quick question before I go: is it the price, or are you just not selling right now? Want to make sure I'm not bothering you in 6 months if nothing'll change.",
       "disinterest", 1],
      ["How did you get my number?",
       "Public records — your name's on the deed. We pull a list of absentee owners in Springfield and Holyoke quarterly. Want me to mark you off the list right now?",
       "privacy", 2],
      ["What's your offer?",
       "Honestly it's somewhere between [low] and [high] depending on condition. I give real numbers after a 10-minute walkthrough — a guess now is either a lowball or a number I'd have to walk back. Fair?",
       "price", 3],
      ["I already have an offer",
       "Good — sounds like you're already thinking about it. What's at? And is that cash with no contingencies, or are they getting a loan? Difference between financed and a 14-day cash close is usually 15-20k of certainty. Worth 10 minutes to compare?",
       "competition", 4],
    ];
    for (const o of objections) {
      await conn.execute(
        "INSERT INTO objection_responses (objection, response, category, priority, is_active)" +
        " VALUES (?, ?, ?, ?, 1)" +
        " ON DUPLICATE KEY UPDATE response = VALUES(response), priority = VALUES(priority)",
        o
      );
    }
    console.log(`Upserted ${objections.length} objection responses`);
    await conn.end();
    console.log("Done.");
  } catch (err: any) { console.error(err.message); process.exit(1); }
}
main();
