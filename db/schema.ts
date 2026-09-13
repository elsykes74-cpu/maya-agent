import {
  pgTable,
  pgEnum,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  bigserial,
  bigint,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const motivationLevelEnum = pgEnum("motivation_level", ["hot", "warm", "cold"]);
export const occupancyStatusEnum = pgEnum("occupancy_status", ["owner_occupied", "tenant", "vacant"]);
export const propertyConditionEnum = pgEnum("property_condition", [
  "light_rehab", "medium_rehab", "heavy_rehab", "move_in_ready",
]);
export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close",
]);
export const callTypeEnum = pgEnum("call_type", [
  "initial", "follow_up", "appointment_confirmation", "voicemail",
]);
export const callOutcomeEnum = pgEnum("call_outcome", [
  "answered", "voicemail", "no_answer", "busy", "wrong_number", "disconnected",
  "callback_requested", "appointment_set", "not_interested", "dnc",
]);
export const smsDirectionEnum = pgEnum("sms_direction", ["outbound", "inbound"]);
export const smsStatusEnum = pgEnum("sms_status", ["sent", "delivered", "failed", "replied"]);
export const appointmentTypeEnum = pgEnum("appointment_type", ["walkthrough", "phone_call", "video_call"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled", "confirmed", "completed", "cancelled", "no_show",
]);
export const complianceResultEnum = pgEnum("compliance_result", ["pass", "fail", "warning"]);
export const dncReasonEnum = pgEnum("dnc_reason", [
  "seller_request", "national_registry", "litigant", "disconnected", "manual",
]);
export const callingProviderEnum = pgEnum("calling_provider", ["vapi", "bland", "retell", "custom"]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft", "active", "paused", "completed", "archived",
]);
export const motivationFilterEnum = pgEnum("motivation_filter", ["all", "hot", "warm", "cold"]);
export const stageFilterEnum = pgEnum("stage_filter", [
  "all", "lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close",
]);
export const campaignLeadStatusEnum = pgEnum("campaign_lead_status", [
  "pending", "queued", "calling", "completed", "failed", "skipped_dnc", "skipped_invalid",
]);
export const callResultEnum = pgEnum("call_result", [
  "answered", "voicemail", "no_answer", "busy", "appointment_set", "not_interested", "dnc", "failed",
]);
export const scrubStatusEnum = pgEnum("scrub_status", [
  "pending", "pass", "fail_dnc", "fail_litigant", "fail_invalid", "fail_landline",
]);
export const phoneStatusEnum = pgEnum("phone_status", [
  "valid", "invalid", "disconnected", "voip", "landline", "mobile", "unknown",
]);
export const lineTypeEnum = pgEnum("line_type", ["mobile", "landline", "voip", "unknown"]);
export const scrubListTypeEnum = pgEnum("scrub_list_type", ["dnc", "litigant", "disconnected", "custom"]);
export const callQueueStatusEnum = pgEnum("call_queue_status", [
  "queued", "scrubbing", "scrub_failed", "dialing", "connected", "completed", "failed", "cancelled",
]);
export const scrubResultEnum = pgEnum("scrub_result", ["pass", "dnc", "litigant", "invalid", "landline"]);
export const callQueueOutcomeEnum = pgEnum("call_queue_outcome", [
  "answered", "voicemail", "no_answer", "busy", "appointment_set", "not_interested", "dnc", "failed",
]);

export const leadTypeEnum = pgEnum("lead_type", [
  "vacant", "absentee_owner", "probate", "tax_delinquent", "pre_foreclosure",
  "tired_landlord", "code_violation", "expired_listing", "fsbo", "high_equity",
  "inherited", "fire_damaged", "long_term_owner", "other",
]);

export const confidenceLevelEnum = pgEnum("confidence_level", ["high", "medium", "low"]);

// ── CRM enums ────────────────────────────────────────────────────────────────

export const taskTypeEnum = pgEnum("task_type", [
  "call_back", "send_sms", "send_email", "follow_up", "visit", "contract", "other",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending", "in_progress", "completed", "cancelled", "snoozed",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "call", "sms", "email", "note", "visit", "offer", "appointment", "status_change", "system",
]);
export const offerStatusEnum = pgEnum("offer_status", [
  "draft", "submitted", "countered", "accepted", "rejected", "expired", "withdrawn",
]);
export const buyerStatusEnum = pgEnum("buyer_status", ["active", "inactive", "closed"]);
export const analysisTypeEnum = pgEnum("analysis_type", [
  "stack_score", "comps", "flip", "brrrr", "buy_hold", "rental", "custom",
]);
export const followUpEnrollmentStatusEnum = pgEnum("follow_up_enrollment_status", [
  "active", "paused", "completed", "cancelled",
]);
export const duplicateFlagStatusEnum = pgEnum("duplicate_flag_status", [
  "pending", "confirmed", "dismissed",
]);
export const attributionChannelEnum = pgEnum("attribution_channel", [
  "direct_mail", "cold_call", "sms", "facebook", "google", "referral",
  "list_import", "driving_for_dollars", "other",
]);

// ── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  googleId: varchar("googleId", { length: 255 }),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const leadSources = pgTable("lead_sources", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadSource = typeof leadSources.$inferSelect;

export const leadProfiles = pgTable("lead_profiles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadProfile = typeof leadProfiles.$inferSelect;

export const leads = pgTable("leads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  propertyAddress: varchar("property_address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }).default("MA"),
  zipCode: varchar("zip_code", { length: 20 }),

  sourceId: bigint("source_id", { mode: "number" }),
  profileId: bigint("profile_id", { mode: "number" }),

  motivationLevel: motivationLevelEnum("motivation_level").default("cold"),
  timeline: varchar("timeline", { length: 50 }),

  occupancyStatus: occupancyStatusEnum("occupancy_status"),
  condition: propertyConditionEnum("condition"),
  estimatedRepairs: numeric("estimated_repairs", { precision: 12, scale: 2 }).default("0"),

  beds: integer("beds"),
  baths: numeric("baths", { precision: 3, scale: 1 }),
  squareFootage: integer("square_footage"),

  askingPrice: numeric("asking_price", { precision: 12, scale: 2 }),
  arv: numeric("arv", { precision: 12, scale: 2 }),
  mao: numeric("mao", { precision: 12, scale: 2 }),
  assignmentFee: numeric("assignment_fee", { precision: 12, scale: 2 }).default("5000"),

  keyPainPoints: text("key_pain_points"),
  objectionsRaised: text("objections_raised"),

  pipelineStage: pipelineStageEnum("pipeline_stage").default("lead"),

  appointmentSet: boolean("appointment_set").default(false),
  appointmentDate: timestamp("appointment_date"),
  appointmentTime: varchar("appointment_time", { length: 20 }),

  lastContactDate: timestamp("last_contact_date"),
  nextFollowUpDate: timestamp("next_follow_up_date"),

  callCount: integer("call_count").default(0),
  smsCount: integer("sms_count").default(0),

  notes: text("notes"),

  // ── Lead Finder Bot fields ──────────────────────────────────────────────────
  leadType: leadTypeEnum("lead_type").default("other"),
  leadScore: integer("lead_score").default(0),

  ownerMailingAddress: text("owner_mailing_address"),
  county: varchar("county", { length: 100 }),
  yearBuilt: integer("year_built"),
  lotSize: varchar("lot_size", { length: 50 }),
  assessedValue: numeric("assessed_value", { precision: 12, scale: 2 }),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  estimatedEquity: numeric("estimated_equity", { precision: 12, scale: 2 }),
  lastSaleDate: timestamp("last_sale_date"),
  lastSalePrice: numeric("last_sale_price", { precision: 12, scale: 2 }),
  taxStatus: varchar("tax_status", { length: 100 }),
  foreclosureStatus: varchar("foreclosure_status", { length: 100 }),
  ownershipYears: integer("ownership_years"),

  isVacant: boolean("is_vacant").default(false),
  isAbsentee: boolean("is_absentee").default(false),
  isProbate: boolean("is_probate").default(false),
  hasCodeViolations: boolean("has_code_violations").default(false),
  hasTaxDelinquency: boolean("has_tax_delinquency").default(false),
  isPreForeclosure: boolean("is_pre_foreclosure").default(false),
  isFsbo: boolean("is_fsbo").default(false),
  isExpiredListing: boolean("is_expired_listing").default(false),
  isOutOfState: boolean("is_out_of_state").default(false),
  isMultifamilyLandlord: boolean("is_multifamily_landlord").default(false),
  hasVisibleDistress: boolean("has_visible_distress").default(false),

  callOpening: text("call_opening"),
  smsOpener: text("sms_opener"),
  outreachAngle: text("outreach_angle"),
  confidenceLevel: confidenceLevelEnum("confidence_level").default("medium"),
  dateFound: timestamp("date_found"),

  // ── Research & Messaging fields ──────────────────────────────────────────────
  researchSummary: text("research_summary"),
  callBriefing: text("call_briefing"),
  distressSignals: text("distress_signals"),
  webMentions: text("web_mentions"),
  // ────────────────────────────────────────────────────────────────────────────

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdBy: bigint("created_by", { mode: "number" }),

  // ── External dedup id (e.g. "cl:1234567890" for Craigslist posts) ──────────
  // Indexed + unique so concurrent scrape runs can't double-insert the same lead.
  externalId: varchar("external_id", { length: 64 }).unique(),

  // ── Public-record enrichment ──────────────────────────────────────────────
  // Deed-derived sale history from RentCast property records (public records /
  // tax assessor aggregation). lastSaleDate / lastSalePrice columns hold the
  // latest; this keeps the full chain for the UI timeline.
  saleHistory: jsonb("sale_history").$type<Array<{ date: string | null; price: number | null; type?: string | null }>>(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ── Scrape run log ────────────────────────────────────────────────────────────
// Each scheduled Craigslist run records here so the /findleads bot command can
// report the latest cached results without scraping live (serverless timeouts).
export const scrapeRuns = pgTable("scrape_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: varchar("source", { length: 32 }).notNull().default("craigslist"),
  status: varchar("status", { length: 16 }).notNull().default("ok"), // ok | error | blocked
  found: integer("found").notNull().default(0),
  added: integer("added").notNull().default(0),
  // JSON summary of new leads [{title, price, phone, motivationLevel, motivationFlags, url}]
  newLeadsJson: text("new_leads_json"),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});
export type ScrapeRun = typeof scrapeRuns.$inferSelect;

// ── RentCast quota ledger ─────────────────────────────────────────────────────
// One row per RentCast API call so a monthly cap can be enforced in code and
// the free tier is never exceeded (registry scan + record enrichment share it).
export const rentcastUsage = pgTable("rentcast_usage", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  endpoint: varchar("endpoint", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type RentcastUsage = typeof rentcastUsage.$inferSelect;

export const followUpMessages = pgTable("follow_up_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  messageType: varchar("message_type", { length: 50 }).notNull(),
  tone: varchar("tone", { length: 50 }).default("friendly"),
  content: text("content").notNull(),
  createdBy: varchar("created_by", { length: 50 }).default("ladyjaye"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type FollowUpMessage = typeof followUpMessages.$inferSelect;

export const calls = pgTable("calls", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),

  callType: callTypeEnum("call_type").default("initial"),
  callOutcome: callOutcomeEnum("call_outcome"),

  duration: integer("duration"),

  scriptUsed: text("script_used"),
  notes: text("notes"),

  painSignals: text("pain_signals"),
  priceDiscussed: boolean("price_discussed").default(false),
  sellerAskingPrice: numeric("seller_asking_price", { precision: 12, scale: 2 }),

  voicemailLeft: boolean("voicemail_left").default(false),
  smsSent: boolean("sms_sent").default(false),

  appointmentSet: boolean("appointment_set").default(false),
  appointmentDate: timestamp("appointment_date"),

  callRecordingUrl: varchar("call_recording_url", { length: 500 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: bigint("created_by", { mode: "number" }),
});

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

export const smsLogs = pgTable("sms_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),

  sequenceDay: integer("sequence_day").default(0),
  messageContent: text("message_content").notNull(),
  direction: smsDirectionEnum("direction").default("outbound"),
  status: smsStatusEnum("status").default("sent"),

  repliedAt: timestamp("replied_at"),
  replyContent: text("reply_content"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SMSLog = typeof smsLogs.$inferSelect;

export const appointments = pgTable("appointments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),

  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: varchar("scheduled_time", { length: 20 }).notNull(),
  duration: integer("duration").default(30),

  appointmentType: appointmentTypeEnum("appointment_type").default("walkthrough"),
  status: appointmentStatusEnum("status").default("scheduled"),

  notes: text("notes"),
  maoPresented: numeric("mao_presented", { precision: 12, scale: 2 }),
  contractSigned: boolean("contract_signed").default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Appointment = typeof appointments.$inferSelect;

export const aiConfig = pgTable("ai_config", {
  id: bigserial("id", { mode: "number" }).primaryKey(),

  systemPrompt: text("system_prompt").notNull(),
  openerScript: text("opener_script").notNull(),
  discoveryQuestions: text("discovery_questions").notNull(),
  positioningScript: text("positioning_script").notNull(),
  priceAnchorScript: text("price_anchor_script").notNull(),
  closeScript: text("close_script").notNull(),
  voicemailScript: text("voicemail_script").notNull(),

  complianceDisclaimer: text("compliance_disclaimer"),

  elevenLabsApiKey: text("elevenlabs_api_key"),
  elevenLabsVoiceId: text("elevenlabs_voice_id"),
  elevenLabsVoiceName: text("elevenlabs_voice_name"),

  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioFromNumber: text("twilio_from_number"),

  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type AIConfig = typeof aiConfig.$inferSelect;

export const smsTemplates = pgTable("sms_templates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  day: integer("day").default(0),
  content: text("content").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SMSTemplate = typeof smsTemplates.$inferSelect;

export const objectionResponses = pgTable("objection_responses", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  objection: varchar("objection", { length: 255 }).notNull(),
  response: text("response").notNull(),
  category: varchar("category", { length: 100 }),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ObjectionResponse = typeof objectionResponses.$inferSelect;

export const complianceLogs = pgTable("compliance_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }),
  callId: bigint("call_id", { mode: "number" }),

  checkType: varchar("check_type", { length: 100 }).notNull(),
  result: complianceResultEnum("result").default("pass"),
  details: text("details"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ComplianceLog = typeof complianceLogs.$inferSelect;

export const dncList = pgTable("dnc_list", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  reason: dncReasonEnum("reason").default("manual"),
  source: varchar("source", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DNCList = typeof dncList.$inferSelect;

export const callingConfig = pgTable("calling_config", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: callingProviderEnum("provider").default("vapi"),
  apiKey: varchar("api_key", { length: 500 }),
  apiEndpoint: varchar("api_endpoint", { length: 500 }),
  assistantId: varchar("assistant_id", { length: 255 }),
  fromPhoneNumber: varchar("from_phone_number", { length: 20 }),
  maxDailyCalls: integer("max_daily_calls").default(100),
  callWindowStart: varchar("call_window_start", { length: 10 }).default("09:00"),
  callWindowEnd: varchar("call_window_end", { length: 10 }).default("19:00"),
  timezone: varchar("timezone", { length: 50 }).default("America/New_York"),
  voicemailEnabled: boolean("voicemail_enabled").default(true),
  smsFollowUpEnabled: boolean("sms_follow_up_enabled").default(true),
  scrubDncBeforeCall: boolean("scrub_dnc_before_call").default(true),
  scrubLitigants: boolean("scrub_litigants").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type CallingConfig = typeof callingConfig.$inferSelect;

export const campaigns = pgTable("campaigns", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: campaignStatusEnum("status").default("draft"),
  motivationFilter: motivationFilterEnum("motivation_filter").default("all"),
  profileFilter: bigint("profile_filter", { mode: "number" }),
  stageFilter: stageFilterEnum("stage_filter").default("all"),
  maxCallsPerLead: integer("max_calls_per_lead").default(3),
  callIntervalHours: integer("call_interval_hours").default(48),
  totalLeads: integer("total_leads").default(0),
  callsCompleted: integer("calls_completed").default(0),
  appointmentsSet: integer("appointments_set").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Campaign = typeof campaigns.$inferSelect;

export const campaignLeads = pgTable("campaign_leads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  campaignId: bigint("campaign_id", { mode: "number" }).notNull(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  status: campaignLeadStatusEnum("status").default("pending"),
  attempts: integer("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  callResult: callResultEnum("call_result"),
  externalCallId: varchar("external_call_id", { length: 255 }),
  scrubStatus: scrubStatusEnum("scrub_status").default("pending"),
  scrubDetails: text("scrub_details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CampaignLead = typeof campaignLeads.$inferSelect;

export const phoneValidation = pgTable("phone_validation", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  status: phoneStatusEnum("status").default("unknown"),
  carrier: varchar("carrier", { length: 100 }),
  lineType: lineTypeEnum("line_type").default("unknown"),
  validatedAt: timestamp("validated_at").notNull().defaultNow(),
});

export type PhoneValidation = typeof phoneValidation.$inferSelect;

export const webhookEvents = pgTable("webhook_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: callingProviderEnum("provider").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: text("payload"),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;

export const scrubLists = pgTable("scrub_lists", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  listType: scrubListTypeEnum("list_type").default("custom"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScrubList = typeof scrubLists.$inferSelect;

export const scrubListEntries = pgTable("scrub_list_entries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  scrubListId: bigint("scrub_list_id", { mode: "number" }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScrubListEntry = typeof scrubListEntries.$inferSelect;

export const callQueue = pgTable("call_queue", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  campaignId: bigint("campaign_id", { mode: "number" }).notNull(),
  campaignLeadId: bigint("campaign_lead_id", { mode: "number" }).notNull(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  status: callQueueStatusEnum("status").default("queued"),
  scrubResult: scrubResultEnum("scrub_result"),
  externalCallId: varchar("external_call_id", { length: 255 }),
  callOutcome: callQueueOutcomeEnum("call_outcome"),
  transcript: text("transcript"),
  recordingUrl: varchar("recording_url", { length: 500 }),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CallQueue = typeof callQueue.$inferSelect;

// ── CRM tables ────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  type: taskTypeEnum("type").default("other").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  dueAt: timestamp("due_at"),
  status: taskStatusEnum("status").default("pending").notNull(),
  snoozedUntil: timestamp("snoozed_until"),
  completedAt: timestamp("completed_at"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export const activities = pgTable("activities", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  type: activityTypeEnum("type").default("note").notNull(),
  body: text("body").notNull(),
  linkedTable: varchar("linked_table", { length: 50 }),
  linkedId: bigint("linked_id", { mode: "number" }),
  metadata: text("metadata"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

export const offers = pgTable("offers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  offerAmount: numeric("offer_amount", { precision: 12, scale: 2 }).notNull(),
  status: offerStatusEnum("status").default("draft").notNull(),
  counterAmount: numeric("counter_amount", { precision: 12, scale: 2 }),
  assignmentFee: numeric("assignment_fee", { precision: 12, scale: 2 }),
  arvUsed: numeric("arv_used", { precision: 12, scale: 2 }),
  repairEstimate: numeric("repair_estimate", { precision: 12, scale: 2 }),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at"),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = typeof offers.$inferInsert;

export const propertyAnalyses = pgTable("property_analyses", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  analysisType: analysisTypeEnum("analysis_type").default("custom").notNull(),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  createdBy: varchar("created_by", { length: 50 }).default("quickkick"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PropertyAnalysis = typeof propertyAnalyses.$inferSelect;
export type InsertPropertyAnalysis = typeof propertyAnalyses.$inferInsert;

export const buyers = pgTable("buyers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  status: buyerStatusEnum("status").default("active").notNull(),
  notes: text("notes"),
  lastPurchaseDate: timestamp("last_purchase_date"),
  totalPurchases: integer("total_purchases").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Buyer = typeof buyers.$inferSelect;
export type InsertBuyer = typeof buyers.$inferInsert;

export const buyerCriteria = pgTable("buyer_criteria", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  buyerId: bigint("buyer_id", { mode: "number" }).notNull(),
  zipCodes: text("zip_codes"),
  cities: text("cities"),
  minPrice: numeric("min_price", { precision: 12, scale: 2 }),
  maxPrice: numeric("max_price", { precision: 12, scale: 2 }),
  minBeds: integer("min_beds"),
  maxBeds: integer("max_beds"),
  minBaths: numeric("min_baths", { precision: 3, scale: 1 }),
  maxBaths: numeric("max_baths", { precision: 3, scale: 1 }),
  minSqft: integer("min_sqft"),
  maxSqft: integer("max_sqft"),
  propertyTypes: text("property_types"),
  minArv: numeric("min_arv", { precision: 12, scale: 2 }),
  maxArv: numeric("max_arv", { precision: 12, scale: 2 }),
  prefersVacant: boolean("prefers_vacant").default(false),
  prefersOffMarket: boolean("prefers_off_market").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type BuyerCriteria = typeof buyerCriteria.$inferSelect;
export type InsertBuyerCriteria = typeof buyerCriteria.$inferInsert;

export const followUpSequences = pgTable("follow_up_sequences", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  steps: text("steps").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type FollowUpSequence = typeof followUpSequences.$inferSelect;
export type InsertFollowUpSequence = typeof followUpSequences.$inferInsert;

export const followUpEnrollments = pgTable("follow_up_enrollments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  sequenceId: bigint("sequence_id", { mode: "number" }).notNull(),
  currentStep: integer("current_step").default(0),
  status: followUpEnrollmentStatusEnum("status").default("active").notNull(),
  nextRunAt: timestamp("next_run_at"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FollowUpEnrollment = typeof followUpEnrollments.$inferSelect;
export type InsertFollowUpEnrollment = typeof followUpEnrollments.$inferInsert;

export const leadAttributions = pgTable("lead_attributions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  sourceId: bigint("source_id", { mode: "number" }),
  channel: attributionChannelEnum("channel").default("other"),
  campaign: varchar("campaign", { length: 255 }),
  listName: varchar("list_name", { length: 255 }),
  importDate: timestamp("import_date"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadAttribution = typeof leadAttributions.$inferSelect;
export type InsertLeadAttribution = typeof leadAttributions.$inferInsert;

export const duplicateFlags = pgTable("duplicate_flags", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leadId: bigint("lead_id", { mode: "number" }).notNull(),
  duplicateLeadId: bigint("duplicate_lead_id", { mode: "number" }).notNull(),
  matchScore: integer("match_score").default(0),
  matchFields: text("match_fields"),
  status: duplicateFlagStatusEnum("status").default("pending").notNull(),
  resolvedBy: bigint("resolved_by", { mode: "number" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DuplicateFlag = typeof duplicateFlags.$inferSelect;
export type InsertDuplicateFlag = typeof duplicateFlags.$inferInsert;
