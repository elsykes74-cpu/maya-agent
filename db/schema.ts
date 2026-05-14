import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  int,
  decimal,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  googleId: varchar("googleId", { length: 255 }),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const leadSources = mysqlTable("lead_sources", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadSource = typeof leadSources.$inferSelect;

export const leadProfiles = mysqlTable("lead_profiles", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priority: int("priority").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LeadProfile = typeof leadProfiles.$inferSelect;

export const leads = mysqlTable("leads", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  propertyAddress: varchar("property_address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }).default("MA"),
  zipCode: varchar("zip_code", { length: 20 }),
  
  sourceId: bigint("source_id", { mode: "number", unsigned: true }),
  profileId: bigint("profile_id", { mode: "number", unsigned: true }),
  
  motivationLevel: mysqlEnum("motivation_level", ["hot", "warm", "cold"]).default("cold"),
  timeline: varchar("timeline", { length: 50 }),
  
  occupancyStatus: mysqlEnum("occupancy_status", ["owner_occupied", "tenant", "vacant"]),
  condition: mysqlEnum("condition", ["light_rehab", "medium_rehab", "heavy_rehab", "move_in_ready"]),
  estimatedRepairs: decimal("estimated_repairs", { precision: 12, scale: 2 }).default("0"),
  
  beds: int("beds"),
  baths: decimal("baths", { precision: 3, scale: 1 }),
  squareFootage: int("square_footage"),
  
  askingPrice: decimal("asking_price", { precision: 12, scale: 2 }),
  arv: decimal("arv", { precision: 12, scale: 2 }),
  mao: decimal("mao", { precision: 12, scale: 2 }),
  assignmentFee: decimal("assignment_fee", { precision: 12, scale: 2 }).default("5000"),
  
  keyPainPoints: text("key_pain_points"),
  objectionsRaised: text("objections_raised"),
  
  pipelineStage: mysqlEnum("pipeline_stage", [
    "lead",
    "outreach",
    "scoring",
    "hot_routing",
    "warm_nurture",
    "cold_drip",
    "appointment",
    "close"
  ]).default("lead"),
  
  appointmentSet: boolean("appointment_set").default(false),
  appointmentDate: timestamp("appointment_date"),
  appointmentTime: varchar("appointment_time", { length: 20 }),
  
  lastContactDate: timestamp("last_contact_date"),
  nextFollowUpDate: timestamp("next_follow_up_date"),
  
  callCount: int("call_count").default(0),
  smsCount: int("sms_count").default(0),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

export const calls = mysqlTable("calls", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  
  callType: mysqlEnum("call_type", ["initial", "follow_up", "appointment_confirmation", "voicemail"]).default("initial"),
  callOutcome: mysqlEnum("call_outcome", [
    "answered",
    "voicemail",
    "no_answer",
    "busy",
    "wrong_number",
    "disconnected",
    "callback_requested",
    "appointment_set",
    "not_interested",
    "dnc"
  ]),
  
  duration: int("duration"),
  
  scriptUsed: text("script_used"),
  notes: text("notes"),
  
  painSignals: text("pain_signals"),
  priceDiscussed: boolean("price_discussed").default(false),
  sellerAskingPrice: decimal("seller_asking_price", { precision: 12, scale: 2 }),
  
  voicemailLeft: boolean("voicemail_left").default(false),
  smsSent: boolean("sms_sent").default(false),
  
  appointmentSet: boolean("appointment_set").default(false),
  appointmentDate: timestamp("appointment_date"),
  
  callRecordingUrl: varchar("call_recording_url", { length: 500 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
});

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

export const smsLogs = mysqlTable("sms_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  
  sequenceDay: int("sequence_day").default(0),
  messageContent: text("message_content").notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound"),
  status: mysqlEnum("status", ["sent", "delivered", "failed", "replied"]).default("sent"),
  
  repliedAt: timestamp("replied_at"),
  replyContent: text("reply_content"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SMSLog = typeof smsLogs.$inferSelect;

export const appointments = mysqlTable("appointments", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: varchar("scheduled_time", { length: 20 }).notNull(),
  duration: int("duration").default(30),
  
  appointmentType: mysqlEnum("appointment_type", ["walkthrough", "phone_call", "video_call"]).default("walkthrough"),
  
  status: mysqlEnum("status", ["scheduled", "confirmed", "completed", "cancelled", "no_show"]).default("scheduled"),
  
  notes: text("notes"),
  maoPresented: decimal("mao_presented", { precision: 12, scale: 2 }),
  contractSigned: boolean("contract_signed").default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Appointment = typeof appointments.$inferSelect;

export const aiConfig = mysqlTable("ai_config", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  
  systemPrompt: text("system_prompt").notNull(),
  openerScript: text("opener_script").notNull(),
  discoveryQuestions: text("discovery_questions").notNull(),
  positioningScript: text("positioning_script").notNull(),
  priceAnchorScript: text("price_anchor_script").notNull(),
  closeScript: text("close_script").notNull(),
  voicemailScript: text("voicemail_script").notNull(),
  
  complianceDisclaimer: text("compliance_disclaimer"),
  
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type AIConfig = typeof aiConfig.$inferSelect;

export const smsTemplates = mysqlTable("sms_templates", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  day: int("day").default(0),
  content: text("content").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SMSTemplate = typeof smsTemplates.$inferSelect;

export const objectionResponses = mysqlTable("objection_responses", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  objection: varchar("objection", { length: 255 }).notNull(),
  response: text("response").notNull(),
  category: varchar("category", { length: 100 }),
  priority: int("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ObjectionResponse = typeof objectionResponses.$inferSelect;

export const complianceLogs = mysqlTable("compliance_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }),
  callId: bigint("call_id", { mode: "number", unsigned: true }),
  
  checkType: varchar("check_type", { length: 100 }).notNull(),
  result: mysqlEnum("result", ["pass", "fail", "warning"]).default("pass"),
  details: text("details"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ComplianceLog = typeof complianceLogs.$inferSelect;

export const dncList = mysqlTable("dnc_list", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  reason: mysqlEnum("reason", ["seller_request", "national_registry", "litigant", "disconnected", "manual"]).default("manual"),
  source: varchar("source", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DNCList = typeof dncList.$inferSelect;

export const callingConfig = mysqlTable("calling_config", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  provider: mysqlEnum("provider", ["vapi", "bland", "retell", "custom"]).default("vapi"),
  apiKey: varchar("api_key", { length: 500 }),
  apiEndpoint: varchar("api_endpoint", { length: 500 }),
  assistantId: varchar("assistant_id", { length: 255 }),
  fromPhoneNumber: varchar("from_phone_number", { length: 20 }),
  maxDailyCalls: int("max_daily_calls").default(100),
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

export const campaigns = mysqlTable("campaigns", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "active", "paused", "completed", "archived"]).default("draft"),
  motivationFilter: mysqlEnum("motivation_filter", ["all", "hot", "warm", "cold"]).default("all"),
  profileFilter: bigint("profile_filter", { mode: "number", unsigned: true }),
  stageFilter: mysqlEnum("stage_filter", ["all", "lead", "outreach", "scoring", "hot_routing", "warm_nurture", "cold_drip", "appointment", "close"]).default("all"),
  maxCallsPerLead: int("max_calls_per_lead").default(3),
  callIntervalHours: int("call_interval_hours").default(48),
  totalLeads: int("total_leads").default(0),
  callsCompleted: int("calls_completed").default(0),
  appointmentsSet: int("appointments_set").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Campaign = typeof campaigns.$inferSelect;

export const campaignLeads = mysqlTable("campaign_leads", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  campaignId: bigint("campaign_id", { mode: "number", unsigned: true }).notNull(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  status: mysqlEnum("status", ["pending", "queued", "calling", "completed", "failed", "skipped_dnc", "skipped_invalid"]).default("pending"),
  attempts: int("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  callResult: mysqlEnum("call_result", ["answered", "voicemail", "no_answer", "busy", "appointment_set", "not_interested", "dnc", "failed"]),
  externalCallId: varchar("external_call_id", { length: 255 }),
  scrubStatus: mysqlEnum("scrub_status", ["pending", "pass", "fail_dnc", "fail_litigant", "fail_invalid", "fail_landline"]).default("pending"),
  scrubDetails: text("scrub_details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CampaignLead = typeof campaignLeads.$inferSelect;

export const phoneValidation = mysqlTable("phone_validation", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["valid", "invalid", "disconnected", "voip", "landline", "mobile", "unknown"]).default("unknown"),
  carrier: varchar("carrier", { length: 100 }),
  lineType: mysqlEnum("line_type", ["mobile", "landline", "voip", "unknown"]).default("unknown"),
  validatedAt: timestamp("validated_at").notNull().defaultNow(),
});

export type PhoneValidation = typeof phoneValidation.$inferSelect;

export const webhookEvents = mysqlTable("webhook_events", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  provider: mysqlEnum("provider", ["vapi", "bland", "retell", "custom"]).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: text("payload"),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;

export const scrubLists = mysqlTable("scrub_lists", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  listType: mysqlEnum("list_type", ["dnc", "litigant", "disconnected", "custom"]).default("custom"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScrubList = typeof scrubLists.$inferSelect;

export const scrubListEntries = mysqlTable("scrub_list_entries", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  scrubListId: bigint("scrub_list_id", { mode: "number", unsigned: true }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScrubListEntry = typeof scrubListEntries.$inferSelect;

export const callQueue = mysqlTable("call_queue", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().notNull().primaryKey(),
  campaignId: bigint("campaign_id", { mode: "number", unsigned: true }).notNull(),
  campaignLeadId: bigint("campaign_lead_id", { mode: "number", unsigned: true }).notNull(),
  leadId: bigint("lead_id", { mode: "number", unsigned: true }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["queued", "scrubbing", "scrub_failed", "dialing", "connected", "completed", "failed", "cancelled"]).default("queued"),
  scrubResult: mysqlEnum("scrub_result", ["pass", "dnc", "litigant", "invalid", "landline"]),
  externalCallId: varchar("external_call_id", { length: 255 }),
  callOutcome: mysqlEnum("call_outcome", ["answered", "voicemail", "no_answer", "busy", "appointment_set", "not_interested", "dnc", "failed"]),
  transcript: text("transcript"),
  recordingUrl: varchar("recording_url", { length: 500 }),
  errorMessage: text("error_message"),
  retryCount: int("retry_count").default(0),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CallQueue = typeof callQueue.$inferSelect;
