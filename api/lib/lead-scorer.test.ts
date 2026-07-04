import { describe, it, expect } from "vitest";
import {
  computeLeadScore,
  scoreToMotivation,
  scoreToPriorityLabel,
  generateCallOpening,
  generateSMSOpener,
  generateOutreachAngle,
} from "./lead-scorer";

describe("computeLeadScore", () => {
  it("returns 0 for a lead with no distress indicators", () => {
    expect(computeLeadScore({})).toBe(0);
  });

  it("sums individual indicator weights", () => {
    // pre-foreclosure (25) + tax delinquency (20) + probate (20) + vacant (20) = 85
    expect(
      computeLeadScore({
        isPreForeclosure: true,
        hasTaxDelinquency: true,
        isProbate: true,
        isVacant: true,
      })
    ).toBe(85);
  });

  it("caps the score at 100 when every indicator is set", () => {
    expect(
      computeLeadScore({
        hasTaxDelinquency: true,
        isPreForeclosure: true,
        isProbate: true,
        isVacant: true,
        isAbsentee: true,
        hasCodeViolations: true,
        isExpiredListing: true,
        isFsbo: true,
        ownershipYears: 20,
        isOutOfState: true,
        isMultifamilyLandlord: true,
        hasVisibleDistress: true,
      })
    ).toBe(100);
  });

  it("only counts long ownership at 15+ years", () => {
    expect(computeLeadScore({ ownershipYears: 14 })).toBe(0);
    expect(computeLeadScore({ ownershipYears: 15 })).toBe(10);
  });

  it("ignores null indicator values", () => {
    expect(computeLeadScore({ isPreForeclosure: null, ownershipYears: null })).toBe(0);
  });
});

describe("scoreToMotivation / scoreToPriorityLabel boundaries", () => {
  it("maps 80+ to hot, 60-79 to warm, below 60 to cold", () => {
    expect(scoreToMotivation(80)).toBe("hot");
    expect(scoreToMotivation(79)).toBe("warm");
    expect(scoreToMotivation(60)).toBe("warm");
    expect(scoreToMotivation(59)).toBe("cold");
    expect(scoreToMotivation(0)).toBe("cold");
  });

  it("maps priority labels at 80/60/40 boundaries", () => {
    expect(scoreToPriorityLabel(80)).toBe("HOT LEAD");
    expect(scoreToPriorityLabel(60)).toBe("WARM LEAD");
    expect(scoreToPriorityLabel(40)).toBe("NURTURE LEAD");
    expect(scoreToPriorityLabel(39)).toBe("LOW PRIORITY");
  });
});

describe("outreach generators", () => {
  it("call opening references only the street part of the address", () => {
    const opening = generateCallOpening("12 Maple St, Springfield, MA 01103");
    expect(opening).toContain("12 Maple St");
    expect(opening).not.toContain("Springfield");
  });

  it("SMS opener uses first name + street and stays within 320 chars", () => {
    const sms = generateSMSOpener("Jane Q Public", "12 Maple St, Springfield, MA");
    expect(sms).toContain("Hi Jane,");
    expect(sms).toContain("12 Maple St");
    expect(sms.length).toBeLessThanOrEqual(320);
  });

  it("outreach angle falls back to the generic angle for unknown lead types", () => {
    const generic = generateOutreachAngle("other");
    expect(generateOutreachAngle("not_a_real_type")).toBe(generic);
    expect(generateOutreachAngle(null)).toBe(generic);
    expect(generateOutreachAngle("probate")).not.toBe(generic);
  });
});
