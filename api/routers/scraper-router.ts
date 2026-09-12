import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { runCraigslistScrape, formatScrapeAlert } from "../lib/craigslist-scraper";
import { sendAlert } from "../lib/telegram";

export const scraperRouter = createRouter({
  // Trigger a Craigslist scrape run and notify both bots
  run: publicQuery
    .input(z.object({ notify: z.boolean().default(true) }).optional())
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await runCraigslistScrape(db);

      if (input?.notify !== false && result.added > 0) {
        const msg = formatScrapeAlert(result);
        await sendAlert(msg, "quickkick");
      }

      return { found: result.found, added: result.added };
    }),
});
