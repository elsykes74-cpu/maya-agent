import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { runCraigslistScrape, formatScrapeAlert, recordScrapeRun, getLatestScrapeRun } from "../lib/craigslist-scraper";
import { sendAlert } from "../lib/telegram";
import { env } from "../lib/env";

export const scraperRouter = createRouter({
  // Trigger a Craigslist scrape run and notify both bots.
  // Protected by CRON_SECRET — never expose an unauthenticated scrape trigger,
  // or anyone can burn the server's IP reputation with Craigslist.
  run: publicQuery
    .input(z.object({ secret: z.string().optional(), notify: z.boolean().default(true) }).optional())
    .mutation(async ({ input }) => {
      if (!env.cronSecret || input?.secret !== env.cronSecret) {
        throw new Error("Unauthorized: valid CRON_SECRET required");
      }
      const db = getDb();
      try {
        const result = await runCraigslistScrape(db);
        if (result.blocked) {
          await recordScrapeRun(db, {
            status: "blocked",
            found: 0,
            added: 0,
            error: "Craigslist blocked the server IP (HTTP 403/429/503). Set CL_PROXY_URL to a residential proxy to restore scanning.",
          });
          return { found: 0, added: 0, blocked: true };
        }
        await recordScrapeRun(db, {
          status: "ok",
          found: result.found,
          added: result.added,
          newLeads: result.newLeads,
        });

        if (input?.notify !== false && result.added > 0) {
          const msg = formatScrapeAlert(result);
          await sendAlert(msg, "quickkick");
          await sendAlert(msg, "ladyjaye");
        }

        return { found: result.found, added: result.added };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await recordScrapeRun(db, {
          status: "error",
          found: 0,
          added: 0,
          error: message,
        }).catch(() => {});
        throw err;
      }
    }),

  // Latest cached scrape run (used by /findleads and dashboards).
  latest: publicQuery.query(async () => {
    const db = getDb();
    const run = await getLatestScrapeRun(db);
    if (!run) return null;
    return {
      id: run.id,
      status: run.status,
      found: run.found,
      added: run.added,
      error: run.error,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      newLeads: run.newLeadsJson ? JSON.parse(run.newLeadsJson) : [],
    };
  }),
});
