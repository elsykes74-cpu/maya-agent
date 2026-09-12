// Small, dependency-free text helpers shared by the scrapers.
// Kept import-free so the phone/entity logic can be unit-tested in isolation.

/** Decode HTML entities retained after tag stripping (titles, bodies). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Extract the most plausible US seller phone from plain listing text.
 * Searches the posting body only (never raw HTML/JS) and requires the match
 * to not be embedded in a longer digit string, so timestamps, posting IDs,
 * and script constants aren't mistaken for a phone number.
 * Returns the number formatted as "(413) 555-0123", or null.
 */
export function extractPhone(text: string): string | null {
  const m = text.match(/(?<!\d)(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})(?!\d)/);
  if (!m) return null;
  return m[1].replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
}
