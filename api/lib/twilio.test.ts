import { describe, it, expect } from "vitest";
import { normalizePhoneNumber, resolveAppUrl } from "./twilio";

describe("normalizePhoneNumber", () => {
  it("passes through E.164 numbers unchanged", () => {
    expect(normalizePhoneNumber("+14135551234")).toBe("+14135551234");
  });

  it("adds +1 to bare 10-digit US numbers", () => {
    expect(normalizePhoneNumber("4135551234")).toBe("+14135551234");
  });

  it("strips formatting before normalizing", () => {
    expect(normalizePhoneNumber("(413) 555-1234")).toBe("+14135551234");
    expect(normalizePhoneNumber("1-413-555-1234")).toBe("+14135551234");
  });

  it("returns unusable input unchanged rather than guessing", () => {
    expect(normalizePhoneNumber("555-1234")).toBe("555-1234");
  });
});

describe("resolveAppUrl", () => {
  it("strips a trailing slash so path joins don't double up", () => {
    expect(resolveAppUrl("https://maya-agent-rho.vercel.app/")).toBe(
      "https://maya-agent-rho.vercel.app"
    );
  });

  it("leaves clean URLs untouched", () => {
    expect(resolveAppUrl("https://example.com")).toBe("https://example.com");
  });
});
