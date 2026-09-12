import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { runCraigslistScrape, formatScrapeAlert, recordScrapeRun, getLatestScrapeRun } from "../lib/craigslist-scraper";
import {
  runRegistryScrape as runRentcastScrape,
  formatRegistryAlert as formatRentcastAlert,
} from "../lib/registry-source";
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

  // Trigger a RentCast registry pull (licensed data — no anti-bot blocking).
  // Secret-gated like the Craigslist trigger: each pull burns API quota.
  runRegistry: publicQuery
    .input(z.object({ secret: z.string().optional(), notify: z.boolean().default(true) }).optional())
    .mutation(async ({ input }) => {
      if (!env.cronSecret || input?.secret !== env.cronSecret) {
        throw new Error("Unauthorized: valid CRON_SECRET required");
      }
      const db = getDb();
      const result = await runRentcastScrape(db);

      if (input?.notify !== false && (result.added > 0 || !result.ok)) {
        await sendAlert(formatRentcastAlert(result), "quickkick");
      }

      return { ok: result.ok, found: result.found, added: result.added, error: result.error ?? null };
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
