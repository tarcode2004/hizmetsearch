/**
 * Internal-only helpers for exercising the chat pipeline headlessly
 * (via `npx convex run`). Not callable from clients — internalMutation
 * is only reachable with an admin key or from other server functions.
 */
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

const TEST_TOKEN_IDENTIFIER = "test|research-loop";

/**
 * Find-or-create a synthetic test user + conversation so the research
 * loop can be run end-to-end from the CLI without a Clerk session.
 */
export const ensureTestConversation = internalMutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", TEST_TOKEN_IDENTIFIER))
      .unique();
    let userId = user?._id;
    if (!userId) {
      userId = await ctx.db.insert("users", {
        name: "Research Loop Test",
        email: "research-loop-test@example.invalid",
        tokenIdentifier: TEST_TOKEN_IDENTIFIER,
      });
    }
    const conversationId = await ctx.db.insert("conversations", {
      userId,
      title: args.title ?? "Research loop test",
      model: "claude",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    });
    return { userId, conversationId };
  },
});

/** Fetch one message doc for headless verification (CLI-only). */
export const getMessage = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

/** List currently-streaming messages (CLI-only; watchdog verification). */
export const listStreaming = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_streaming", (q) => q.eq("isStreaming", true))
      .collect();
    return rows.map((m) => ({
      _id: m._id,
      role: m.role,
      createdAt: m.createdAt,
      isStreaming: m.isStreaming,
      contentHead: m.content.slice(0, 80),
      nSteps: m.researchSteps?.length ?? 0,
    }));
  },
});

/** Most recent messages, newest first (CLI-only verification helper). */
export const listRecentMessages = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("messages").order("desc").take(args.limit ?? 5);
    return rows.map((m) => ({
      _id: m._id,
      role: m.role,
      isStreaming: m.isStreaming,
      nSteps: m.researchSteps?.length ?? 0,
      researchStatus: m.researchStatus ?? null,
      contentTail: m.content.slice(-160),
    }));
  },
});

/** Echo the current auth identity (CLI-only; --identity plumbing check). */
export const whoami = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.auth.getUserIdentity();
  },
});

/** Point the synthetic test user at a given tokenIdentifier so
 *  `npx convex run --identity` impersonation resolves to it (CLI-only). */
export const alignTestUserToken = internalMutation({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "test|research-loop"))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, { tokenIdentifier: args.tokenIdentifier });
      return user._id;
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("users", {
      name: "Research Loop Test",
      email: "research-loop-test@example.invalid",
      tokenIdentifier: args.tokenIdentifier,
    });
  },
});

/**
 * Upsert the synthetic test user's subscription with explicit budgets
 * (CLI-only). Used to verify billing-equivalent quota deduction and the
 * quota-exceeded pre-flight without a Stripe flow.
 */
export const setTestSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    plan: v.optional(
      v.union(v.literal("free"), v.literal("pro"), v.literal("scholar"))
    ),
    claudeLimit: v.optional(v.number()),
    claudeUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const nextMonth = now + 30 * 24 * 60 * 60 * 1000;
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const patch = {
      plan: args.plan ?? "free",
      status: "active" as const,
      currentPeriodEnd: nextMonth,
      claudeTokensUsed: args.claudeUsed ?? 0,
      geminiTokensUsed: 0,
      claudeTokensLimit: args.claudeLimit ?? 400_000,
      geminiTokensLimit: 100_000,
      claudeCreditTokens: 0,
      geminiCreditTokens: 0,
      claudeTokensToday: 0,
      geminiTokensToday: 0,
      dayResetAt: now + 24 * 60 * 60 * 1000,
      payAsYouGoEnabled: false,
      resetAt: nextMonth,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("subscriptions", { userId: args.userId, ...patch });
  },
});

/** Read the test user's subscription usage counters (CLI-only). */
export const getTestSubscription = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!sub) return null;
    return {
      plan: sub.plan,
      claudeTokensUsed: sub.claudeTokensUsed,
      claudeTokensLimit: sub.claudeTokensLimit,
      claudeTokensToday: sub.claudeTokensToday ?? 0,
      claudeCreditTokens: sub.claudeCreditTokens ?? 0,
    };
  },
});
