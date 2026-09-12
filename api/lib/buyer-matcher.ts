import { eq } from "drizzle-orm";
import { leads, buyers } from "../../db/schema";
import { escapeHtml } from "./telegram";

type Db = ReturnType<typeof import("../queries/connection").getDb>;

export interface BuyerMatch {
  buyerId: number;
  buyerName: string;
  company: string | null;
  phone: string | null;
  score: number;
  reasons: string[];
}

export async function matchBuyersToLead(leadId: number, db: Db): Promise<BuyerMatch[]> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return [];

  const allCriteria = await db.query.buyerCriteria.findMany();
  const activeBuyers = await db.query.buyers.findMany({ where: eq(buyers.status, "active") });
  const buyerMap = new Map(activeBuyers.map((b) => [b.id, b]));

  const matches: BuyerMatch[] = [];

  for (const criteria of allCriteria) {
    const buyer = buyerMap.get(Number(criteria.buyerId));
    if (!buyer) continue;

    let score = 0;
    const reasons: string[] = [];

    const price = Number(lead.askingPrice ?? lead.mao ?? 0);
    const minP = Number(criteria.minPrice ?? 0);
    const maxP = Number(criteria.maxPrice ?? Infinity);
    if (price > 0 && price >= minP && price <= maxP) { score += 2; reasons.push("price fits"); }

    if (lead.beds && criteria.minBeds && lead.beds >= criteria.minBeds) { score += 1; reasons.push("beds ok"); }
    if (lead.beds && criteria.maxBeds && lead.beds <= criteria.maxBeds) { score += 1; }

    const sqft = lead.squareFootage ?? 0;
    if (sqft && criteria.minSqft && sqft >= criteria.minSqft) { score += 1; }
    if (sqft && criteria.maxSqft && sqft <= criteria.maxSqft) { score += 1; }

    const zips = (criteria.zipCodes ?? "").split(",").map((z) => z.trim()).filter(Boolean);
    if (zips.length && lead.zipCode && zips.includes(lead.zipCode)) { score += 3; reasons.push("zip match"); }

    if (criteria.prefersVacant && lead.isVacant) { score += 1; reasons.push("vacant preferred"); }
    if (criteria.prefersOffMarket) { score += 1; reasons.push("off-market preferred"); }

    if (score > 0) {
      matches.push({
        buyerId: buyer.id,
        buyerName: buyer.name,
        company: buyer.company ?? null,
        phone: buyer.phone ?? null,
        score,
        reasons,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 10);
}

export function formatBuyerMatchAlert(
  leadId: number,
  sellerName: string,
  propertyAddress: string,
  askingPrice: string | null | undefined,
  matches: BuyerMatch[]
): string {
  const top = matches.slice(0, 3);
  const priceStr = askingPrice ? ` · Asking $${Number(askingPrice).toLocaleString()}` : "";

  let msg = `🏠 <b>Buyer Match Alert</b>\n\n`;
  msg += `Lead: <b>#${leadId} ${escapeHtml(sellerName)}</b>\n`;
  msg += `📍 ${escapeHtml(propertyAddress)}${priceStr}\n\n`;

  if (!top.length) {
    msg += `<i>No buyer matches found. Add buyers with /addbuyer or set buy box criteria in the web app.</i>`;
    return msg;
  }

  msg += `🎯 <b>Top ${top.length} Buyer${top.length > 1 ? "s" : ""}</b>\n`;
  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    const label = m.company ? `${m.buyerName} (${m.company})` : m.buyerName;
    const phone = m.phone ? ` · ${m.phone}` : "";
    msg += `\n<b>${i + 1}. ${escapeHtml(label)}</b>${escapeHtml(phone)} — ${m.score}pts\n`;
    if (m.reasons.length) msg += `   ✓ ${m.reasons.join(" · ")}\n`;
  }

  msg += `\nUse /offer ${leadId} [amount] to create an offer.`;
  return msg;
}
