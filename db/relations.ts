import { relations } from "drizzle-orm";
import {
  users, leads, calls, smsLogs, appointments, leadSources, leadProfiles,
  dncList, campaigns, campaignLeads, phoneValidation, scrubLists, scrubListEntries,
  callQueue, followUpMessages
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  leads: many(leads),
  calls: many(calls),
}));

export const leadSourcesRelations = relations(leadSources, ({ many }) => ({
  leads: many(leads),
}));

export const leadProfilesRelations = relations(leadProfiles, ({ many }) => ({
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  source: one(leadSources, { fields: [leads.sourceId], references: [leadSources.id] }),
  profile: one(leadProfiles, { fields: [leads.profileId], references: [leadProfiles.id] }),
  creator: one(users, { fields: [leads.createdBy], references: [users.id] }),
  calls: many(calls),
  smsLogs: many(smsLogs),
  appointment: one(appointments, { fields: [leads.id], references: [appointments.leadId] }),
  phoneValidations: many(phoneValidation),
  campaignLeads: many(campaignLeads),
  followUpMessages: many(followUpMessages),
}));

export const followUpMessagesRelations = relations(followUpMessages, ({ one }) => ({
  lead: one(leads, { fields: [followUpMessages.leadId], references: [leads.id] }),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  lead: one(leads, { fields: [calls.leadId], references: [leads.id] }),
}));

export const smsLogsRelations = relations(smsLogs, ({ one }) => ({
  lead: one(leads, { fields: [smsLogs.leadId], references: [leads.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  lead: one(leads, { fields: [appointments.leadId], references: [leads.id] }),
}));

export const dncListRelations = relations(dncList, ({}: any) => ({}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  campaignLeads: many(campaignLeads),
}));

export const campaignLeadsRelations = relations(campaignLeads, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignLeads.campaignId], references: [campaigns.id] }),
  lead: one(leads, { fields: [campaignLeads.leadId], references: [leads.id] }),
}));

export const phoneValidationRelations = relations(phoneValidation, ({ one }) => ({
  lead: one(leads, { fields: [phoneValidation.leadId], references: [leads.id] }),
}));

export const scrubListsRelations = relations(scrubLists, ({ many }) => ({
  entries: many(scrubListEntries),
}));

export const scrubListEntriesRelations = relations(scrubListEntries, ({ one }) => ({
  scrubList: one(scrubLists, { fields: [scrubListEntries.scrubListId], references: [scrubLists.id] }),
}));

export const callQueueRelations = relations(callQueue, ({ one }) => ({
  campaign: one(campaigns, { fields: [callQueue.campaignId], references: [campaigns.id] }),
  campaignLead: one(campaignLeads, { fields: [callQueue.campaignLeadId], references: [campaignLeads.id] }),
  lead: one(leads, { fields: [callQueue.leadId], references: [leads.id] }),
}));
