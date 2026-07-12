/**
 * Smoke tests for plan limit invariants and the billing-equivalent
 * weighting used for quota accounting. These exist mostly to catch
 * accidental regressions in the limits when the pricing changes.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS,
  DAILY_LIMITS,
  CACHE_READ_WEIGHT,
  CACHE_WRITE_WEIGHT,
  ESTIMATED_RESEARCH_ANSWER_TOKENS,
  billingEquivalentTokens,
} from "../lib/planLimits";

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

  it("affords the intended number of deep-research answers per month", () => {
    // One deep answer ≈ 95K billing-equivalent tokens (measured, T4).
    const PER_ANSWER = 95_000;
    const answers = (plan: keyof typeof PLAN_LIMITS) =>
      PLAN_LIMITS[plan].claude / PER_ANSWER;
    expect(answers("free")).toBeGreaterThanOrEqual(3);
    expect(answers("free")).toBeLessThanOrEqual(5);
    expect(answers("pro")).toBeGreaterThanOrEqual(60);
    expect(answers("scholar")).toBeGreaterThanOrEqual(300);
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

  it("daily Claude cap admits at least one deep-research answer", () => {
    for (const plan of ["free", "pro", "scholar"] as const) {
      expect(DAILY_LIMITS[plan].claude).toBeGreaterThanOrEqual(
        ESTIMATED_RESEARCH_ANSWER_TOKENS
      );
    }
  });
});

describe("billingEquivalentTokens", () => {
  it("matches Anthropic's cache billing multipliers", () => {
    expect(CACHE_READ_WEIGHT).toBe(0.1);
    expect(CACHE_WRITE_WEIGHT).toBe(1.25);
  });

  it("is identity for fully uncached usage (plain chat unchanged)", () => {
    expect(
      billingEquivalentTokens({ inputTokens: 8_000, outputTokens: 1_000 })
    ).toBe(9_000);
    expect(
      billingEquivalentTokens({
        inputTokens: 8_000,
        outputTokens: 1_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      })
    ).toBe(9_000);
  });

  it("weights cache reads at 0.1x and writes at 1.25x", () => {
    // 1000 uncached + 10_000 reads + 4_000 writes (face input 15_000)
    expect(
      billingEquivalentTokens({
        inputTokens: 15_000,
        outputTokens: 500,
        cacheReadTokens: 10_000,
        cacheCreationTokens: 4_000,
      })
    ).toBe(1_000 + 1_000 + 5_000 + 500);
  });

  it("reproduces the T4 measured deep answer at ~95K equivalent (vs ~192K face)", () => {
    // Measured on dev (unique-chipmunk-902): face input 186,886 of which
    // cache reads 124,832 and cache writes 61,968; output 4,876.
    const equivalent = billingEquivalentTokens({
      inputTokens: 186_886,
      outputTokens: 4_876,
      cacheReadTokens: 124_832,
      cacheCreationTokens: 61_968,
    });
    expect(equivalent).toBeGreaterThan(90_000);
    expect(equivalent).toBeLessThan(100_000);
    // Sanity: less than half the face-value charge.
    expect(equivalent).toBeLessThan((186_886 + 4_876) / 2);
    // The pre-flight estimate stays within one answer of the real cost.
    expect(ESTIMATED_RESEARCH_ANSWER_TOKENS).toBeLessThanOrEqual(equivalent);
  });

  it("never returns negative values on malformed input", () => {
    expect(
      billingEquivalentTokens({
        inputTokens: 100,
        outputTokens: -5,
        cacheReadTokens: 500, // larger than inputTokens
        cacheCreationTokens: 0,
      })
    ).toBeGreaterThanOrEqual(0);
  });
});
