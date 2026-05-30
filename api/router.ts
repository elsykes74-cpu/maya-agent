import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { leadsRouter } from "./routers/leads-router";
import { callsRouter } from "./routers/calls-router";
import { smsRouter } from "./routers/sms-router";
import { appointmentsRouter } from "./routers/appointments-router";
import { aiConfigRouter } from "./routers/ai-config-router";
import { dealAnalysisRouter } from "./routers/deal-analysis-router";
import { callingConfigRouter } from "./routers/calling-config-router";
import { campaignsRouter } from "./routers/campaigns-router";
import { dncRouter } from "./routers/dnc-router";
import { webhooksRouter } from "./routers/webhooks-router";
import { mayaRouter } from "./routers/maya-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  leads: leadsRouter,
  calls: callsRouter,
  sms: smsRouter,
  appointments: appointmentsRouter,
  aiConfig: aiConfigRouter,
  dealAnalysis: dealAnalysisRouter,
  callingConfig: callingConfigRouter,
  campaigns: campaignsRouter,
  dnc: dncRouter,
  webhooks: webhooksRouter,
  maya: mayaRouter,
});

export type AppRouter = typeof appRouter;
