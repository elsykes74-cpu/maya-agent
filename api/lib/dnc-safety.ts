import { eq, or } from "drizzle-orm";

import { dncList } from "../../db/schema";
import { getDb } from "../queries/connection";
import { normalizePhoneDigits } from "./call-safety";

export async function isPhoneOnDncList(phone: string): Promise<boolean> {
  const digits = normalizePhoneDigits(phone);
  if (digits.length !== 10) return true;

  const db = getDb();
  const entries = await db
    .select({ id: dncList.id })
    .from(dncList)
    .where(or(eq(dncList.phone, digits), eq(dncList.phone, `+1${digits}`)))
    .limit(1);
  return entries.length > 0;
}
