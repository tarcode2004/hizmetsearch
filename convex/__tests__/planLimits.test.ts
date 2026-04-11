/**
 * Smoke tests for plan limit invariants. These exist mostly to catch
 * accidental regressions in the limits when the pricing changes.
 */
import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, DAILY_LIMITS } from "../lib/planLimits";

describe("PLAN_LIMITS", () => {
  it("has all three plans", () => {
    expect(PLAN_LIMITS.free).toBeDefined();
    expect(PLAN_LIMITS.pro).toBeDefined();
    expect(PLAN_LIMITS.scholar).toBeDefined();
  });

  it("ratchets monotonically free → pro → scholar", () => {
    expect(PLAN_LIMITS.pro.claude).toBeGreaterThan(PLAN_LIMITS.free.claude);
    expect(PLAN_LIMITS.pro.gemini).toBeGreaterThan(PLAN_LIMITS.free.gemini);
    expect(PLAN_LIMITS.scholar.claude).toBeGreaterThan(PLAN_LIMITS.pro.claude);
    expect(PLAN_LIMITS.scholar.gemini).toBeGreaterThan(PLAN_LIMITS.pro.gemini);
  });

  it("Gemini allotment is always at least 5x Claude (since Gemini is ~half the price)", () => {
    for (const plan of ["free", "pro", "scholar"] as const) {
      expect(PLAN_LIMITS[plan].gemini / PLAN_LIMITS[plan].claude).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("DAILY_LIMITS", () => {
  it("daily caps are strictly less than monthly limits", () => {
    for (const plan of ["free", "pro", "scholar"] as const) {
      expect(DAILY_LIMITS[plan].claude).toBeLessThan(PLAN_LIMITS[plan].claude);
      expect(DAILY_LIMITS[plan].gemini).toBeLessThan(PLAN_LIMITS[plan].gemini);
    }
  });

  it("daily cap is at least 1/30 of the monthly limit (so a normal user never hits it)", () => {
    for (const plan of ["free", "pro", "scholar"] as const) {
      expect(DAILY_LIMITS[plan].claude * 30).toBeGreaterThanOrEqual(
        PLAN_LIMITS[plan].claude
      );
      expect(DAILY_LIMITS[plan].gemini * 30).toBeGreaterThanOrEqual(
        PLAN_LIMITS[plan].gemini
      );
    }
  });
});
