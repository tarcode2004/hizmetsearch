import { describe, expect, it } from "vitest";
import { budgetRefusal, type BudgetSubscription } from "../lib/budgetGate";
import { ESTIMATED_RESEARCH_ANSWER_TOKENS } from "../lib/planLimits";

function sub(over: Partial<BudgetSubscription> = {}): BudgetSubscription {
  return {
    plan: "free",
    claudeTokensUsed: 0,
    geminiTokensUsed: 0,
    claudeTokensLimit: 400_000,
    geminiTokensLimit: 100_000,
    claudeCreditTokens: 0,
    geminiCreditTokens: 0,
    claudeTokensToday: 0,
    geminiTokensToday: 0,
    dayResetAt: Date.now() + 60 * 60 * 1000,
    ...over,
  };
}

describe("budgetRefusal", () => {
  it("allows a send with budget remaining", () => {
    expect(
      budgetRefusal({ sub: sub(), family: "claude", agentic: false }),
    ).toBeNull();
  });

  it("skips all checks when there is no subscription row", () => {
    expect(
      budgetRefusal({ sub: null, family: "claude", agentic: true }),
    ).toBeNull();
  });

  it("refuses when the monthly budget is exhausted and no credit remains", () => {
    const refusal = budgetRefusal({
      sub: sub({ claudeTokensUsed: 400_000 }),
      family: "claude",
      agentic: false,
    });
    expect(refusal).toMatch(/Token budget exhausted for claude/);
  });

  it("lets a credit pack cover an exhausted monthly budget", () => {
    expect(
      budgetRefusal({
        sub: sub({ claudeTokensUsed: 400_000, claudeCreditTokens: 200_000 }),
        family: "claude",
        agentic: false,
      }),
    ).toBeNull();
  });

  it("gates the family that actually executes, not the other one", () => {
    // Claude exhausted, Gemini fine: a claude send is refused, a gemini
    // send passes. This is the check the A2 bypass used to skip whenever
    // ANY BYOK key (even a Gemini-only one) was active.
    const s = sub({ claudeTokensUsed: 400_000 });
    expect(
      budgetRefusal({ sub: s, family: "claude", agentic: false }),
    ).not.toBeNull();
    expect(
      budgetRefusal({ sub: s, family: "gemini", agentic: false }),
    ).toBeNull();
  });

  it("refuses deep research when the remaining allotment can't cover one answer", () => {
    const refusal = budgetRefusal({
      sub: sub({
        claudeTokensUsed: 400_000 - ESTIMATED_RESEARCH_ANSWER_TOKENS + 1,
      }),
      family: "claude",
      agentic: true,
    });
    expect(refusal).toMatch(/deep research/);
  });

  it("counts credit toward the deep-research pre-flight", () => {
    expect(
      budgetRefusal({
        sub: sub({
          claudeTokensUsed: 400_000,
          claudeCreditTokens: ESTIMATED_RESEARCH_ANSWER_TOKENS,
        }),
        family: "claude",
        agentic: true,
      }),
    ).toBeNull();
  });

  it("enforces the daily cap inside the day window", () => {
    const refusal = budgetRefusal({
      sub: sub({ claudeTokensToday: 100_000 }),
      family: "claude",
      agentic: false,
    });
    expect(refusal).toMatch(/Daily token cap/);
  });

  it("ignores the daily cap once the day window has rolled over", () => {
    expect(
      budgetRefusal({
        sub: sub({ claudeTokensToday: 100_000, dayResetAt: Date.now() - 1 }),
        family: "claude",
        agentic: false,
      }),
    ).toBeNull();
  });

  it("lets credit override the daily cap", () => {
    expect(
      budgetRefusal({
        sub: sub({ claudeTokensToday: 100_000, claudeCreditTokens: 50_000 }),
        family: "claude",
        agentic: false,
      }),
    ).toBeNull();
  });
});
