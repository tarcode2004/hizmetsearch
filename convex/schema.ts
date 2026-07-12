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
    /** Public read-only sharing token. When set, anyone with this token
     * can view the conversation read-only via /share/:token. Unset = private. */
    shareToken: v.optional(v.string()),
  })
    .index("by_user", ["userId", "updatedAt"])
    .index("by_user_active", ["userId", "isArchived", "updatedAt"])
    .index("by_share_token", ["shareToken"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.union(v.literal("gemini"), v.literal("claude"))),
    /** Specific model variant the user chose at send time
     *  (e.g. `claude-opus-4-5`, `gemini-2.5-flash-lite`). Optional for
     *  backward-compat with messages from before variants were exposed. */
    modelVariant: v.optional(v.string()),
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
          /** Research-agent locator: inclusive passage-ordering range within
           *  the work (doc_id) this citation points at. Set by the Sonnet 5
           *  tool loop; absent on classic retrieval sources. */
          passage_start: v.optional(v.number()),
          passage_end: v.optional(v.number()),
        })
      )
    ),
    isStreaming: v.boolean(),
    /** Agentic chat: when the assistant ran a multi-step deep search,
     *  this captures the per-round plan so the UI can show the user
     *  what queries were issued and how many sources each round added.
     *  Empty/absent for plain (single-shot) chat replies. */
    agenticSteps: v.optional(
      v.array(
        v.object({
          query: v.string(),
          resultCount: v.number(),
          /** Free-form rationale from the planner for why this query
           *  was issued. Optional — round 1 has no reasoning. */
          reasoning: v.optional(v.string()),
        }),
      ),
    ),
    /** Live status string updated mid-stream while the agent is
     *  searching/thinking. Cleared on finalize. */
    agenticStatus: v.optional(v.string()),
    /** Research agent (Sonnet 5 tool loop): one entry per executed tool
     *  call. Replaces `agenticSteps` for new agentic messages — the old
     *  field stays for historical planner-mode messages and its renderer. */
    researchSteps: v.optional(
      v.array(
        v.object({
          tool: v.string(),
          inputSummary: v.string(),
          resultCount: v.optional(v.number()),
          elapsedMs: v.optional(v.number()),
          isError: v.optional(v.boolean()),
          ts: v.number(),
        }),
      ),
    ),
    /** Live one-line status while the research agent is working
     *  (e.g. "Reading Sözler…"). Cleared on finalize. */
    researchStatus: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    // Watchdog cron: sweep messages stuck in isStreaming=true.
    .index("by_streaming", ["isStreaming", "createdAt"]),

  /**
   * Ephemeral row that backs progressive (streaming) search renders.
   *
   * The pattern: a public mutation creates a row in `pending` state and
   * schedules an internal action to run the full retrieval pipeline.
   * The action patches this row at each milestone (results landed,
   * highlights done, ai answer done) and the client subscribes via a
   * reactive `useQuery` so it gets the milestones as they happen
   * instead of waiting for the whole pipeline to finish.
   *
   * Rows are short-lived: cleaned up by a cron after ~30 minutes.
   */
  liveSearches: defineTable({
    userId: v.optional(v.id("users")),
    query: v.string(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    language: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("expanding"),
      v.literal("retrieving"),
      v.literal("ranked"),
      v.literal("highlighting"),
      v.literal("synthesizing"),
      v.literal("done"),
      v.literal("error"),
    ),
    /** Compact JSON of the merged result list at the current stage.
     *  Same shape the search action used to return inline; client
     *  parses on read. Updated as the pipeline progresses. */
    resultsJson: v.optional(v.string()),
    aiAnswer: v.optional(v.string()),
    expansions: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  searchHistory: defineTable({
    userId: v.optional(v.id("users")),
    query: v.string(),
    resultCount: v.number(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    /** Cached payload from the last run of this search. Stored as a
     *  JSON string so the row schema doesn't need to mirror the full
     *  chunk shape — the client parses on read. Lets clicking a
     *  history entry restore results instantly without re-running
     *  the search. Capped at ~200KB by the writer. */
    cachedResultsJson: v.optional(v.string()),
    cachedAiAnswer: v.optional(v.string()),
    cachedExpansions: v.optional(v.array(v.string())),
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
    /** One-time credit pack tokens. Consumed before the monthly allotment.
     * Never reset — stack across months. */
    claudeCreditTokens: v.optional(v.number()),
    geminiCreditTokens: v.optional(v.number()),
    /** Pay-as-you-go (metered overage) opt-in. */
    payAsYouGoEnabled: v.optional(v.boolean()),
    /** Per-day usage counters — guard against runaway scripts draining the
     * monthly allotment in one bad day. Reset daily by `trackUsage`. */
    claudeTokensToday: v.optional(v.number()),
    geminiTokensToday: v.optional(v.number()),
    /** ms timestamp — next daily reset */
    dayResetAt: v.optional(v.number()),
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
    query: v.optional(v.string()),   // the original user query
    model: v.optional(v.string()),   // gemini/claude if applicable
    /** Which specific phrasing actually retrieved this chunk. For
     *  search-page results that's the AI-expanded variant whose hit
     *  was kept after the cross-query merge. For chat agentic mode
     *  it's the round-N planner query. Empty/equal-to-`query` for
     *  plain single-query searches. Used as ground-truth signal for
     *  query-rewriting model training. */
    matchedQuery: v.optional(v.string()),
    /** Full set of AI-expanded queries the search ran. Capped at 5
     *  by the writer. Lets us see "user upvoted this result, the
     *  expansions we tried were X/Y/Z, the one that worked was X". */
    expandedQueries: v.optional(v.array(v.string())),
    /** Frozen snapshot of the chunk at feedback time so analysis
     *  doesn't need to join against the (mutable) Qdrant index later. */
    chunkSnapshot: v.optional(
      v.object({
        chunk_id: v.string(),
        doc_id: v.optional(v.string()),
        title: v.optional(v.string()),
        author_speaker: v.optional(v.string()),
        collection: v.optional(v.string()),
        text_excerpt: v.optional(v.string()),
        page_number: v.optional(v.number()),
        score: v.optional(v.number()),
        rerank_score: v.optional(v.number()),
        language: v.optional(v.string()),
      })
    ),
    /** Filter context the user had set when they rated. */
    filterLanguage: v.optional(v.string()),
    filterCategory: v.optional(v.string()),
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
