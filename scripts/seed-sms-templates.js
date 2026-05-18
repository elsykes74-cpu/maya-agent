/**
 * Seed sms_templates from Kimi agent (automated_outreach_agent.py)
 * Run once: cd ~/Documents/maya-agent/app && npx tsx scripts/seed-sms-templates.js
 */
import { createConnection } from "mysql2/promise";
import "dotenv/config";

(async () => {
  const conn = await createConnection({ uri: process.env.DATABASE_URL });

  const tmpls = [
    {
      name: "Day 0 – Initial Outreach",
      day: 0,
      content:
        "Hi {name}, this is Erick. I noticed your property at {address} may be facing some tax challenges. I help homeowners in situations like yours explore their options — sometimes a quick sale can help resolve these issues and put money in your pocket. No pressure, just here to help if you want to talk. Reply STOP to opt out.",
    },
    {
      name: "Day 2 – Follow-up",
      day: 2,
      content:
        "Hi {name}, Erick again. I wanted to follow up on my message about your property at {address}. I understand this is a big decision, but I may be able to help you resolve your tax situation quickly. Would you be open to a brief call? Reply STOP to opt out.",
    },
    {
      name: "Day 5 – Second Follow-up",
      day: 5,
      content:
        "Hi {name}, Erick here one more time. Just circling back about {address}. Time can be a factor with tax situations — the sooner we resolve this, the more options you have. If you're open to it, I'm happy to swing by and give you a written offer on the spot. No pressure. Reply STOP to opt out.",
    },
    {
      name: "Day 10 – Breakup / Final Message",
      day: 10,
      content:
        "Hi {name}, this is my last message. I know dealing with property taxes can be overwhelming. If you ever want to discuss your options for {address}, I'm here to help. No pressure — just want you to know there's a solution available. Erick. Reply STOP to opt out.",
    },
    {
      name: "Voicemail Drop - Just Found Your Voicemail",
      day: 0,
      content:
        "Hey {name}, just found your voicemail. This is Erick — sorry to bug you. I'm calling about {address}. If you want to chat, call me back at [NUMBER]. No pressure either way. Have a good one.",
    },
  ];

  let inserted = 0;
  for (const t of tmpls) {
    await conn.execute(
      `INSERT INTO sms_templates (name, day, content, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE content = VALUES(content), day = VALUES(day)`,
      [t.name, t.day, t.content]
    );
    inserted++;
  }

  await conn.end();
  console.log(`${inserted} templates upserted.`);
})();
