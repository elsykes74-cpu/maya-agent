export type LeadForScoring = {
  hasTaxDelinquency?: boolean | null;
  isPreForeclosure?: boolean | null;
  isProbate?: boolean | null;
  isVacant?: boolean | null;
  isAbsentee?: boolean | null;
  hasCodeViolations?: boolean | null;
  isExpiredListing?: boolean | null;
  isFsbo?: boolean | null;
  ownershipYears?: number | null;
  isOutOfState?: boolean | null;
  isMultifamilyLandlord?: boolean | null;
  hasVisibleDistress?: boolean | null;
  leadType?: string | null;
};

export type STACKScore = {
  spread: number;    // 0-5: profit potential (equity proxy)
  temperature: number; // 0-5: seller motivation urgency
  ability: number;   // 0-5: deal certainty / likelihood to transact
  clock: number;     // 0-5: speed-to-close urgency
  kick: number;      // 0-5: ease of effort (5 = low effort required)
  total: number;     // 0-25
  label: string;
};

export function computeSTACKScore(lead: LeadForScoring): STACKScore {
  const yrs = lead.ownershipYears ?? 0;

  // S — Spread: equity buildup proxies for profit potential
  let spread = 0;
  if (yrs >= 20) spread += 3;
  else if (yrs >= 10) spread += 2;
  else if (yrs >= 5) spread += 1;
  if (lead.isMultifamilyLandlord) spread += 1; // complex / discounted
  if (lead.isProbate) spread += 1;             // below-market exit
  spread = Math.min(5, spread);

  // T — Temperature: urgency of seller motivation
  let temperature = 0;
  if (lead.isPreForeclosure) temperature += 3;
  if (lead.hasTaxDelinquency) temperature += 2;
  if (lead.isProbate) temperature += 1;
  if (lead.hasVisibleDistress) temperature += 1;
  if (lead.isExpiredListing) temperature += 1;
  temperature = Math.min(5, temperature);

  // A — Ability: deal certainty (owner can and will transact)
  let ability = 0;
  if (lead.isAbsentee) ability += 2;
  if (lead.isOutOfState) ability += 2;
  if (lead.hasTaxDelinquency) ability += 1;
  if (lead.hasCodeViolations) ability += 1;
  if (lead.isProbate) ability += 1; // executor obligated to sell
  ability = Math.min(5, ability);

  // C — Clock: time pressure forcing a quick decision
  let clock = 0;
  if (lead.isPreForeclosure) clock += 3;
  if (lead.hasTaxDelinquency) clock += 2;
  if (lead.hasCodeViolations) clock += 1;
  if (lead.isVacant) clock += 1;      // carrying costs
  if (lead.isExpiredListing) clock += 1;
  clock = Math.min(5, clock);

  // K — Kick: ease of closing (5 = minimal effort required)
  let kick = 2; // baseline
  if (lead.isAbsentee) kick += 1;
  if (lead.isOutOfState) kick += 1;
  if (lead.hasVisibleDistress) kick += 1;
  if (lead.isFsbo) kick -= 1;           // overestimates value
  if (lead.isMultifamilyLandlord) kick -= 1; // sophisticated seller
  if (lead.isProbate) kick -= 1;        // multiple decision makers
  kick = Math.min(5, Math.max(0, kick));

  const total = spread + temperature + ability + clock + kick;

  let label: string;
  if (total >= 20) label = "Elite Deal";
  else if (total >= 15) label = "Strong Deal";
  else if (total >= 10) label = "Average Deal";
  else if (total >= 5) label = "Weak Deal";
  else label = "Pass";

  return { spread, temperature, ability, clock, kick, total, label };
}

function stackBar(score: number, max = 5): string {
  const filled = Math.round(score);
  return "█".repeat(filled) + "░".repeat(max - filled);
}

export function formatSTACKBreakdown(stack: STACKScore): string {
  let msg = `📊 <b>STACK Score: ${stack.total}/25 — ${stack.label}</b>\n`;
  msg += `${"─".repeat(24)}\n`;
  msg += `S Spread      ${stackBar(stack.spread)} ${stack.spread}/5\n`;
  msg += `T Temperature ${stackBar(stack.temperature)} ${stack.temperature}/5\n`;
  msg += `A Ability     ${stackBar(stack.ability)} ${stack.ability}/5\n`;
  msg += `C Clock       ${stackBar(stack.clock)} ${stack.clock}/5\n`;
  msg += `K Kick        ${stackBar(stack.kick)} ${stack.kick}/5\n`;
  return msg;
}

export function computeLeadScore(lead: LeadForScoring): number {
  let score = 0;
  if (lead.hasTaxDelinquency) score += 20;
  if (lead.isPreForeclosure) score += 25;
  if (lead.isProbate) score += 20;
  if (lead.isVacant) score += 20;
  if (lead.isAbsentee) score += 15;
  if (lead.hasCodeViolations) score += 15;
  if (lead.isExpiredListing) score += 15;
  if (lead.isFsbo) score += 10;
  if ((lead.ownershipYears ?? 0) >= 15) score += 10;
  if (lead.isOutOfState) score += 10;
  if (lead.isMultifamilyLandlord) score += 10;
  if (lead.hasVisibleDistress) score += 10;
  return Math.min(100, score);
}

export function scoreToMotivation(score: number): "hot" | "warm" | "cold" {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  return "cold";
}

export function scoreToPriorityLabel(score: number): "HOT LEAD" | "WARM LEAD" | "NURTURE LEAD" | "LOW PRIORITY" {
  if (score >= 80) return "HOT LEAD";
  if (score >= 60) return "WARM LEAD";
  if (score >= 40) return "NURTURE LEAD";
  return "LOW PRIORITY";
}

export function generateCallOpening(address: string): string {
  const street = address.split(",")[0].trim();
  return `Hi, this is Erick. I know this is out of the blue, but I was calling about the property on ${street}. Did I catch you at a bad time?`;
}

export function generateSMSOpener(sellerName: string, address: string): string {
  const firstName = sellerName.split(" ")[0];
  const street = address.split(",")[0].trim();
  const msg = `Hi ${firstName}, this is Erick. I'm local here in Western Mass and had a quick question about your property on ${street}. Would you be open to a quick conversation?`;
  return msg.slice(0, 320);
}

export function generateOutreachAngle(leadType: string | null | undefined): string {
  const type = leadType ?? "other";
  const angles: Record<string, string> = {
    tax_delinquent:
      "Owner is behind on property taxes. Keep tone neutral — don't reference taxes unless they bring it up. Focus on speed and flexibility.",
    pre_foreclosure:
      "Owner may be under financial pressure. Lead with empathy and position your offer as a fast, stress-free exit.",
    probate:
      "Property may be estate-owned. Be patient and compassionate — executor may be overwhelmed with decisions. Offer simplicity.",
    vacant:
      "Property appears unoccupied. Gently ask if they're still using the property and whether they're open to a quick conversation about options.",
    absentee_owner:
      "Owner doesn't live at the property. Likely a landlord or inherited situation. Ask how things are going with the place.",
    tired_landlord:
      "Long-term landlord may be fatigued by repairs, tenants, or management. Ask open-ended questions about how things are going.",
    code_violation:
      "Property has outstanding violations. Frame your offer as removing the liability quickly and cleanly — no repairs needed.",
    expired_listing:
      "Property was listed and didn't sell. Acknowledge the frustration and offer a simpler, no-fee alternative to retail.",
    fsbo:
      "Seller is going it alone. Respect their independence and position as a no-fee, no-hassle backup option.",
    high_equity:
      "Owner has substantial built-up equity. Long-term holder may be ready for a life transition — listen first, talk numbers second.",
    fire_damaged:
      "Property has significant damage. Offer speed and certainty as the alternative to a costly repair and retail process.",
    inherited:
      "Inherited property often means out-of-area family with no emotional attachment. Emphasize simplicity, speed, and zero hassle.",
    long_term_owner:
      "Owner has held the property 15+ years. May be aging, downsizing, or planning a transition. Ask open-ended questions about their plans.",
    other:
      "Build rapport first. Ask open-ended questions about the property and let the seller lead the conversation.",
  };
  return angles[type] ?? angles["other"];
}
