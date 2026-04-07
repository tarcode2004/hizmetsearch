import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.string(),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  conversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    model: v.union(v.literal("gemini"), v.literal("claude")),
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.boolean(),
  })
    .index("by_user", ["userId", "updatedAt"])
    .index("by_user_active", ["userId", "isArchived", "updatedAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.union(v.literal("gemini"), v.literal("claude"))),
    sources: v.optional(
      v.array(
        v.object({
          chunk_id: v.string(),
          doc_id: v.string(),
          text: v.string(),
          parent_text: v.optional(v.string()),
          source_type: v.string(),
          language: v.string(),
          collection: v.string(),
          title: v.string(),
          author_speaker: v.string(),
          publisher: v.string(),
          chapter_section: v.string(),
          page_number: v.optional(v.number()),
          timestamp_start: v.optional(v.number()),
          timestamp_end: v.optional(v.number()),
          score: v.optional(v.number()),
        })
      )
    ),
    isStreaming: v.boolean(),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  searchHistory: defineTable({
    userId: v.optional(v.id("users")),
    query: v.string(),
    resultCount: v.number(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    defaultModel: v.union(v.literal("gemini"), v.literal("claude")),
    defaultLanguage: v.optional(v.string()),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    searchMode: v.union(v.literal("results"), v.literal("ai_answer")),
    byokEnabled: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  // ── Billing ──────────────────────────────────────────────
  subscriptions: defineTable({
    userId: v.id("users"),
    plan: v.union(
      v.literal("free"),
      v.literal("pro"),
      v.literal("scholar")
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("trialing"),
      v.literal("incomplete")
    ),
    currentPeriodEnd: v.number(), // ms timestamp
    claudeTokensUsed: v.number(),
    geminiTokensUsed: v.number(),
    claudeTokensLimit: v.number(),
    geminiTokensLimit: v.number(),
    resetAt: v.number(), // ms timestamp — next monthly reset
  })
    .index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"]),

  // ── Feedback ─────────────────────────────────────────────
  feedback: defineTable({
    userId: v.optional(v.id("users")),
    targetType: v.union(
      v.literal("search_result"),
      v.literal("ai_answer"),
      v.literal("chat_message")
    ),
    targetId: v.string(),  // chunk_id, message_id, or query hash
    rating: v.union(v.literal("up"), v.literal("down")),
    comment: v.optional(v.string()),
    query: v.optional(v.string()),   // the original query for context
    model: v.optional(v.string()),   // gemini/claude if applicable
    createdAt: v.number(),
  })
    .index("by_target", ["targetId", "rating"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_type", ["targetType", "createdAt"]),

  // ── Activity Log ────────────────────────────────────────
  activityLog: defineTable({
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    action: v.string(),  // search, chat, voice, feedback, login, upgrade, etc.
    metadata: v.optional(v.string()), // JSON-stringified extra data
    page: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_session", ["sessionId", "createdAt"])
    .index("by_action", ["action", "createdAt"]),

  // ── BYOK (Bring Your Own Key) ────────────────────────────
  apiKeys: defineTable({
    userId: v.id("users"),
    geminiKey: v.optional(v.string()), // encrypted at rest
    claudeKey: v.optional(v.string()), // encrypted at rest
    geminiKeySet: v.boolean(), // flag without exposing key
    claudeKeySet: v.boolean(),
    isActive: v.boolean(),
    lastValidated: v.optional(v.number()),
  }).index("by_user", ["userId"]),
});
