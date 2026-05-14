const mysql = require('mysql2/promise');
const fs = require('fs');
const { URL } = require('url');

async function seed() {
  const envText = fs.readFileSync('.env', 'utf-8');
  const line = envText.split('\n').find(l => l.startsWith('DATABASE_URL='));
  const dbUrl = line ? line.split('=').slice(1).join('=').trim().replace(/"/g, '') : '';
  
  const parsed = new URL(dbUrl);
  const conn = await mysql.createConnection({
    host: parsed.hostname,
    port: parsed.port || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
    connectTimeout: 10000,
  });

  // Seed lead sources
  const [sources] = await conn.execute('SELECT COUNT(*) as c FROM lead_sources');
  if (sources[0].c == 0) {
    await conn.execute(`
      INSERT INTO lead_sources (name, description, created_at) VALUES
      ('PropStream', 'Distressed property lists from PropStream', NOW()),
      ('BatchLeads', 'Batch skip tracing and lead lists', NOW()),
      ('Direct Mail', 'Direct mail campaign responses', NOW()),
      ('Website', 'Website form submissions', NOW()),
      ('Referral', 'Referrals from other investors or agents', NOW()),
      ('Driving for Dollars', 'Self-sourced driving for dollars', NOW())
    `);
    console.log('Lead sources seeded');
  }

  // Seed lead profiles
  const [profiles] = await conn.execute('SELECT COUNT(*) as c FROM lead_profiles');
  if (profiles[0].c == 0) {
    await conn.execute(`
      INSERT INTO lead_profiles (name, description, priority, created_at) VALUES
      ('Pre-foreclosure / NOD Filed', 'Notice of Default filed, facing foreclosure', 100, NOW()),
      ('Probate / Inherited Property', 'Property in probate or recently inherited', 90, NOW()),
      ('Tax Delinquent (2+ years)', 'Behind on property taxes for 2+ years', 80, NOW()),
      ('Tired Landlords', 'Non-paying or vacant tenants, landlord fatigue', 70, NOW()),
      ('Code Violation Properties', 'Multiple code violations from city', 60, NOW()),
      ('Long-term Owners (20+ years)', 'Owned 20+ years, no mortgage, likely equity rich', 50, NOW()),
      ('Distressed Condition / Heavy Deferred Maintenance', 'Visible distress, major repairs needed', 40, NOW()),
      ('Expired / Withdrawn MLS Listings', 'Failed MLS listing, still wants to sell', 30, NOW()),
      ('FSBOs Priced Above Market', 'For sale by owner, motivated but mispriced', 20, NOW())
    `);
    console.log('Lead profiles seeded');
  }

  // Seed SMS templates
  const [templates] = await conn.execute('SELECT COUNT(*) as c FROM sms_templates');
  if (templates[0].c == 0) {
    await conn.execute(`
      INSERT INTO sms_templates (name, day, content, description, is_active, created_at) VALUES
      ('Day 0 - Initial Follow-up', 0, 'Hey [Name] — this is [Agent Name]. Just left you a voicemail about [Street Address]. No rush, just wanted to connect when you have a minute. — [Number]', 'Send within 5 minutes of a voicemail or no-answer', TRUE, NOW()),
      ('Day 3 - Soft Follow-up', 3, 'Hey [Name] — following up real quick. Are you open to a quick conversation about [Street]? Even just to hear what we\'d offer. Zero pressure.', 'Sent 3 days after initial contact if no reply', TRUE, NOW()),
      ('Day 7 - Final Touch', 7, 'Last reach out — we\'re wrapping up our buying window in this area. If you\'ve had any interest in selling [Street], happy to give you a number this week. If not, totally understand.', 'Final touch before moving to cold drip', TRUE, NOW())
    `);
    console.log('SMS templates seeded');
  }

  // Seed objection responses
  const [objections] = await conn.execute('SELECT COUNT(*) as c FROM objection_responses');
  if (objections[0].c == 0) {
    await conn.execute(`
      INSERT INTO objection_responses (objection, response, category, priority, is_active, created_at) VALUES
      ('I am not interested.', 'Totally fair — out of curiosity, is it because you\'re not thinking about selling, or just not right now?', 'General', 100, TRUE, NOW()),
      ('I already have an agent.', 'No problem at all. Are they actively marketing it, or is that more down the road?', 'Agent', 90, TRUE, NOW()),
      ('I want full / market value.', 'Makes sense. Can I ask — have you gotten any offers yet, or is this more exploratory?', 'Price', 80, TRUE, NOW()),
      ('I need to talk to my family.', 'Absolutely. Would it make sense for all of you to be there for the walkthrough so everyone can ask questions?', 'Decision Maker', 70, TRUE, NOW()),
      ('How did you get my number?', 'Public records — property ownership is public info. I wanted to reach out directly instead of going through a third party.', 'Privacy', 60, TRUE, NOW()),
      ('Send me something in writing.', 'Of course — what\'s the best email? I\'ll shoot over a quick overview and we can go from there.', 'Information', 50, TRUE, NOW())
    `);
    console.log('Objection responses seeded');
  }

  // Seed default AI config
  const [aiRows] = await conn.execute('SELECT COUNT(*) as c FROM ai_config');
  if (aiRows[0].c == 0) {
    await conn.execute(`
      INSERT INTO ai_config (system_prompt, opener_script, discovery_questions, positioning_script, price_anchor_script, close_script, voicemail_script, compliance_disclaimer, updated_at) VALUES
      ('ROLE:\nYou are a real estate acquisitions representative working on behalf of a local investment group in Western Massachusetts. You have deep knowledge of distressed property situations, seller psychology, and how to identify motivated sellers.\n\nOBJECTIVE:\nCall property owners, identify motivation and distress, pre-qualify deal viability, and set appointments for a property walkthrough. You are not closing a sale — you are opening a relationship.\n\nCOMPLIANCE RULES:\n- Never represent yourself or Erick as the guaranteed end buyer\n- Never discuss contract terms in detail\n- Never make price guarantees on the call\n- Position the team as local buyers working with a network of investment partners\n- If asked if you are an agent: I work with a buyer group directly — we are not listing it, we are looking to buy.\n- Stay conversational. Never sound scripted.\n\nTONE:\nCalm, confident, empathetic. You are solving a problem, not selling a product. Never rush. Never argue. Always end by moving the conversation forward.',
      'Hey — is this [Name]? This is [Agent Name] — sorry if this is out of nowhere, I was actually calling about the property on [Street Address]. Did I catch you at a bad time?\\n\\nIF BAD TIME: No worries at all — when is a better time to reach you? I will call back then.\\n\\nIF GO AHEAD: Perfect. So I will be straight with you — we work with a small group of investors in the Springfield area, and [Street] came up on our radar. We are looking to buy in that area and wanted to reach out directly before going any other route.',
      '1. Have you thought at all about selling it at some point?\\n2. What is the condition like right now — is it move-in ready or does it need some work?\\n3. Is anyone living there currently?\\n4. If you did sell — what would your timeline look like?\\n5. What is got you even open to the conversation?',
      'Yeah, that makes a lot of sense. Honestly, most of the people we work with are in similar situations — they just want something simple, without dealing with repairs, listings, or waiting around. That is kind of what we specialize in.',
      'Do you have a number in mind that would make this worth it for you?\\n\\nIF REALISTIC: Got it — that is helpful to know. We would need to look at it in person before we can give you anything firm, but that is in the right ballpark.\\n\\nIF TOO HIGH: I appreciate you being straight with me. We have to factor in condition and what it takes to get it market-ready — so we would need to be somewhere that works on both ends. But that is exactly what the walkthrough is for.',
      'Honestly, the best next step is just a quick walkthrough — takes maybe 20 minutes. We give you a real number, no pressure, no obligation. If it works for both sides, great. If not, no worries at all.\\n\\nWould [Day] or [Day] work better for you?\\n\\nLock the day first. Then the time.',
      'Hey [Name], this is [Agent Name] calling about the property on [Street]. Nothing urgent — just wanted to reach out directly about something that might be worth a quick conversation. You can call me back at [Number], or I will try you again in a day or two. Thanks.',
      'Selling equitable interest — not the property. No brokerage implication. AI never says we will buy your house as a guarantee. AI positions Erick as a local buyer working with a network of investment partners. Never deceptive language. Disclose RE license when required.',
      NOW())
    `);
    console.log('AI config seeded');
  }

  // Seed default calling config
  const [ccRows] = await conn.execute('SELECT COUNT(*) as c FROM calling_config');
  if (ccRows[0].c == 0) {
    await conn.execute(`
      INSERT INTO calling_config (provider, max_daily_calls, call_window_start, call_window_end, timezone, voicemail_enabled, sms_follow_up_enabled, scrub_dnc_before_call, scrub_litigants, updated_at) VALUES
      ('vapi', 100, '09:00', '19:00', 'America/New_York', TRUE, TRUE, TRUE, TRUE, NOW())
    `);
    console.log('Calling config seeded');
  }

  await conn.end();
  console.log('\nSeeding complete!');
}

seed().catch(e => { console.error(e); process.exit(1); });
