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

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdBy: bigint("created_by", { mode: "number" }),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

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
