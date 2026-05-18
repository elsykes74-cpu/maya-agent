/**
 * Maya DB Init — creates all 17 tables from schema.ts
 *
 * Run once (CREATE TABLE IF NOT EXISTS → safe to re-run):
 *   cd ~/Documents/maya-agent/app
 *   npx tsx scripts/init-db.ts
 *
 * Requires: DATABASE_URL in .env
 */
import { createConnection, Connection } from "mysql2/promise";
import "dotenv/config";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL not set in .env"); process.exit(1); }

const BT = "`";
const STMTS = [
`CREATE TABLE IF NOT EXISTS ${BT}users${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}unionId${BT} VARCHAR(255) NOT NULL UNIQUE,
  ${BT}googleId${BT} VARCHAR(255),
  ${BT}name${BT} VARCHAR(255),
  ${BT}email${BT} VARCHAR(320),
  ${BT}avatar${BT} TEXT,
  ${BT}role${BT} ENUM('user','admin') NOT NULL DEFAULT 'user',
  ${BT}createdAt${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${BT}updatedAt${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ${BT}lastSignInAt${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (unionId), INDEX (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}lead_sources${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}name${BT} VARCHAR(100) NOT NULL,
  description TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}lead_profiles${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}name${BT} VARCHAR(100) NOT NULL,
  description TEXT,
  priority INT DEFAULT 0,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}leads${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}seller_name${BT} VARCHAR(255) NOT NULL,
  ${BT}phone${BT} VARCHAR(20),
  ${BT}email${BT} VARCHAR(320),
  ${BT}property_address${BT} VARCHAR(255) NOT NULL,
  ${BT}city${BT} VARCHAR(100),
  ${BT}state${BT} VARCHAR(50) DEFAULT 'MA',
  ${BT}zip_code${BT} VARCHAR(20),
  ${BT}source_id${BT} BIGINT UNSIGNED,
  ${BT}profile_id${BT} BIGINT UNSIGNED,
  ${BT}motivation_level${BT} ENUM('hot','warm','cold') DEFAULT 'cold',
  ${BT}timeline${BT} VARCHAR(50),
  ${BT}occupancy_status${BT} ENUM('owner_occupied','tenant','vacant'),
  ${BT}condition${BT} ENUM('light_rehab','medium_rehab','heavy_rehab','move_in_ready'),
  ${BT}estimated_repairs${BT} DECIMAL(12,2) DEFAULT 0,
  ${BT}beds${BT} INT,
  ${BT}baths${BT} DECIMAL(3,1),
  ${BT}square_footage${BT} INT,
  ${BT}asking_price${BT} DECIMAL(12,2),
  ${BT}arv${BT} DECIMAL(12,2),
  ${BT}mao${BT} DECIMAL(12,2),
  ${BT}assignment_fee${BT} DECIMAL(12,2) DEFAULT 5000,
  ${BT}key_pain_points${BT} TEXT,
  ${BT}objections_raised${BT} TEXT,
  ${BT}pipeline_stage${BT} ENUM('lead','outreach','scoring','hot_routing','warm_nurture','cold_drip','appointment','close')
    DEFAULT 'lead',
  ${BT}appointment_set${BT} BOOLEAN DEFAULT FALSE,
  ${BT}appointment_date${BT} TIMESTAMP,
  ${BT}appointment_time${BT} VARCHAR(20),
  ${BT}last_contact_date${BT} TIMESTAMP,
  ${BT}next_follow_up_date${BT} TIMESTAMP,
  ${BT}call_count${BT} INT DEFAULT 0,
  ${BT}sms_count${BT} INT DEFAULT 0,
  ${BT}notes${BT} TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${BT}updated_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ${BT}created_by${BT} BIGINT UNSIGNED,
  INDEX (motivation_level), INDEX (pipeline_stage), INDEX (state),
  INDEX (source_id), INDEX (profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}sms_templates${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}name${BT} VARCHAR(100) NOT NULL,
  ${BT}day${BT} INT DEFAULT 0,
  ${BT}content${BT} TEXT NOT NULL,
  description TEXT,
  ${BT}is_active${BT} BOOLEAN DEFAULT TRUE,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}objection_responses${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  objection VARCHAR(255) NOT NULL,
  response TEXT NOT NULL,
  category VARCHAR(100),
  priority INT DEFAULT 0,
  ${BT}is_active${BT} BOOLEAN DEFAULT TRUE,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (objection)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}compliance_logs${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}lead_id${BT} BIGINT UNSIGNED,
  ${BT}call_id${BT} BIGINT UNSIGNED,
  ${BT}check_type${BT} VARCHAR(100) NOT NULL,
  result ENUM('pass','fail','warning') DEFAULT 'pass',
  details TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}sms_logs${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}sequence_day${BT} INT DEFAULT 0,
  ${BT}message_content${BT} TEXT NOT NULL,
  ${BT}direction${BT} ENUM('outbound','inbound') DEFAULT 'outbound',
  ${BT}status${BT} ENUM('sent','delivered','failed','replied') DEFAULT 'sent',
  ${BT}replied_at${BT} TIMESTAMP,
  ${BT}reply_content${BT} TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (lead_id), INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}calls${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}call_type${BT} ENUM('initial','follow_up','appointment_confirmation','voicemail')
    DEFAULT 'initial',
  ${BT}call_outcome${BT} ENUM('answered','voicemail','no_answer','busy','wrong_number',
    'disconnected','callback_requested','appointment_set','not_interested','dnc'),
  duration INT,
  ${BT}script_used${BT} TEXT,
  notes TEXT,
  ${BT}pain_signals${BT} TEXT,
  ${BT}price_discussed${BT} BOOLEAN DEFAULT FALSE,
  ${BT}seller_asking_price${BT} DECIMAL(12,2),
  ${BT}voicemail_left${BT} BOOLEAN DEFAULT FALSE,
  ${BT}sms_sent${BT} BOOLEAN DEFAULT FALSE,
  ${BT}appointment_set${BT} BOOLEAN DEFAULT FALSE,
  ${BT}appointment_date${BT} TIMESTAMP,
  ${BT}call_recording_url${BT} VARCHAR(500),
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${BT}created_by${BT} BIGINT UNSIGNED,
  INDEX (lead_id), INDEX (call_outcome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}dnc_list${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}phone${BT} VARCHAR(20) NOT NULL UNIQUE,
  ${BT}name${BT} VARCHAR(255),
  ${BT}reason${BT} ENUM('seller_request','national_registry','litigant','disconnected','manual')
    DEFAULT 'manual',
  source VARCHAR(100),
  notes TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}calling_config${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider ENUM('vapi','bland','retell','custom') DEFAULT 'vapi',
  ${BT}api_key${BT} VARCHAR(500),
  ${BT}api_endpoint${BT} VARCHAR(500),
  ${BT}assistant_id${BT} VARCHAR(255),
  ${BT}from_phone_number${BT} VARCHAR(20),
  ${BT}max_daily_calls${BT} INT DEFAULT 100,
  ${BT}call_window_start${BT} VARCHAR(10) DEFAULT '09:00',
  ${BT}call_window_end${BT} VARCHAR(10) DEFAULT '19:00',
  ${BT}timezone${BT} VARCHAR(50) DEFAULT 'America/New_York',
  ${BT}voicemail_enabled${BT} BOOLEAN DEFAULT TRUE,
  ${BT}sms_follow_up_enabled${BT} BOOLEAN DEFAULT TRUE,
  ${BT}scrub_dnc_before_call${BT} BOOLEAN DEFAULT TRUE,
  ${BT}scrub_litigants${BT} BOOLEAN DEFAULT TRUE,
  ${BT}updatedAt${BT} TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}campaigns${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}name${BT} VARCHAR(255) NOT NULL,
  description TEXT,
  ${BT}status${BT} ENUM('draft','active','paused','completed','archived') DEFAULT 'draft',
  ${BT}motivation_filter${BT} ENUM('all','hot','warm','cold') DEFAULT 'all',
  ${BT}profile_filter${BT} BIGINT UNSIGNED,
  ${BT}stage_filter${BT} ENUM('all','lead','outreach','scoring','hot_routing','warm_nurture',
    'cold_drip','appointment','close') DEFAULT 'all',
  ${BT}max_calls_per_lead${BT} INT DEFAULT 3,
  ${BT}call_interval_hours${BT} INT DEFAULT 48,
  ${BT}total_leads${BT} INT DEFAULT 0,
  ${BT}calls_completed${BT} INT DEFAULT 0,
  ${BT}appointments_set${BT} INT DEFAULT 0,
  ${BT}started_at${BT} TIMESTAMP,
  ${BT}completed_at${BT} TIMESTAMP,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${BT}updated_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (status), INDEX (motivation_filter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}campaign_leads${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}campaign_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}status${BT} ENUM('pending','queued','calling','completed','failed','skipped_dnc','skipped_invalid')
    DEFAULT 'pending',
  ${BT}attempts${BT} INT DEFAULT 0,
  ${BT}last_attempt_at${BT} TIMESTAMP,
  ${BT}next_attempt_at${BT} TIMESTAMP,
  ${BT}call_result${BT} ENUM('answered','voicemail','no_answer','busy','appointment_set',
    'not_interested','dnc','failed'),
  ${BT}external_call_id${BT} VARCHAR(255),
  ${BT}scrub_status${BT} ENUM('pending','pass','fail_dnc','fail_litigant','fail_invalid','fail_landline')
    DEFAULT 'pending',
  ${BT}scrub_details${BT} TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_campaign_lead (campaign_id, lead_id),
  INDEX (campaign_id), INDEX (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}phone_validation${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}phone${BT} VARCHAR(20) NOT NULL,
  ${BT}status${BT} ENUM('valid','invalid','disconnected','voip','landline','mobile','unknown')
    DEFAULT 'unknown',
  carrier VARCHAR(100),
  ${BT}line_type${BT} ENUM('mobile','landline','voip','unknown') DEFAULT 'unknown',
  ${BT}validated_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}webhook_events${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider ENUM('vapi','bland','retell','custom') NOT NULL,
  ${BT}event_type${BT} VARCHAR(100) NOT NULL,
  payload TEXT,
  ${BT}processed${BT} BOOLEAN DEFAULT FALSE,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (provider), INDEX (processed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}ai_config${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}system_prompt${BT} TEXT NOT NULL,
  ${BT}opener_script${BT} TEXT NOT NULL,
  ${BT}discovery_questions${BT} TEXT NOT NULL,
  ${BT}positioning_script${BT} TEXT NOT NULL,
  ${BT}price_anchor_script${BT} TEXT NOT NULL,
  ${BT}close_script${BT} TEXT NOT NULL,
  ${BT}voicemail_script${BT} TEXT NOT NULL,
  ${BT}compliance_disclaimer${BT} TEXT,
  ${BT}updated_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}call_queue${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}campaign_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}campaign_lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}phone${BT} VARCHAR(20) NOT NULL,
  ${BT}status${BT} ENUM('queued','scrubbing','scrub_failed','dialing','connected','completed','failed','cancelled')
    DEFAULT 'queued',
  ${BT}scrub_result${BT} ENUM('pass','dnc','litigant','invalid','landline'),
  ${BT}external_call_id${BT} VARCHAR(255),
  ${BT}call_outcome${BT} ENUM('answered','voicemail','no_answer','busy','appointment_set',
    'not_interested','dnc','failed'),
  ${BT}transcript${BT} TEXT,
  ${BT}recording_url${BT} VARCHAR(500),
  ${BT}error_message${BT} TEXT,
  ${BT}retry_count${BT} INT DEFAULT 0,
  ${BT}scheduled_at${BT} TIMESTAMP,
  ${BT}started_at${BT} TIMESTAMP,
  ${BT}completed_at${BT} TIMESTAMP,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (campaign_id), INDEX (lead_id), INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}scrub_lists${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}name${BT} VARCHAR(255) NOT NULL,
  ${BT}list_type${BT} ENUM('dnc','litigant','disconnected','custom') DEFAULT 'custom',
  description TEXT,
  ${BT}is_active${BT} BOOLEAN DEFAULT TRUE,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}scrub_list_entries${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}scrub_list_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}phone${BT} VARCHAR(20) NOT NULL,
  ${BT}name${BT} VARCHAR(255),
  notes TEXT,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (scrub_list_id),
  UNIQUE KEY unique_scrub_phone (scrub_list_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS ${BT}appointments${BT} (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ${BT}lead_id${BT} BIGINT UNSIGNED NOT NULL,
  ${BT}scheduled_date${BT} TIMESTAMP NOT NULL,
  ${BT}scheduled_time${BT} VARCHAR(20) NOT NULL,
  duration INT DEFAULT 30,
  ${BT}appointment_type${BT} ENUM('walkthrough','phone_call','video_call') DEFAULT 'walkthrough',
  ${BT}status${BT} ENUM('scheduled','confirmed','completed','cancelled','no_show') DEFAULT 'scheduled',
  ${BT}notes${BT} TEXT,
  ${BT}mao_presented${BT} DECIMAL(12,2),
  ${BT}contract_signed${BT} BOOLEAN DEFAULT FALSE,
  ${BT}created_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${BT}updated_at${BT} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (lead_id), INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// ── Run inside async IIFE so tsc/tsx sees no top-level await ──────────────────
(async () => {
  const conn: Connection = await createConnection({ uri: dbUrl });
  let ok = 0, fail = 0;

  for (let i = 0; i < STMTS.length; i++) {
    try {
      await conn.query(STMTS[i]);
      console.log(`  \u2713 table ${String(i + 1).padStart(2, "0")}`);
      ok++;
    } catch (err: any) {
      console.error(`  \u2717 table ${String(i + 1).padStart(2, "0")}: ${err.message}`);
      fail++;
    }
  }

  await conn.end();
  console.log(`\nDone. ${ok} created, ${fail} errored.`);
})();
