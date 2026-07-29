import { createHmac, timingSafeEqual } from "node:crypto";

export function deriveScopedSecret(rootSecret: string, scope: string): string {
  if (!rootSecret) return "";
  return createHmac("sha256", rootSecret).update(scope, "utf8").digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
