"use node";
/**
 * `$ai_generation` event capture for PostHog LLM Analytics.
 *
 * We don't use the @posthog/ai SDK wrappers because:
 *   1. The Convex-recommended path uses Vercel AI SDK (`generateText`),
 *      which we don't use — we call `@anthropic-ai/sdk` and `@google/genai`
 *      directly so we can control prompt caching, retry, and streaming.
 *   2. Manual capture lets us add custom properties (model variant, BYOK,
 *      agentic mode, conversation id, prompt id) that the wrappers don't
 *      know about.
 *
 * The event shape matches the schema PostHog's LLM Analytics tab parses,
 * so the data lands in the same Traces / Generations views as if we had
 * used the official SDK wrappers.
 *
 * Schema reference:
 *   https://posthog.com/docs/llm-analytics/manual-capture#schema
 */
import { getPostHog } from "./posthogServer";
import { computeLLMCost, modelProvider } from "./llmPricing";

/** A single message in the input/output content arrays. */
interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CaptureGenerationArgs {
  /** The Clerk-attributed user id (or "anonymous" if no user). */
  distinctId: string;
  /** Stable trace id grouping multiple generations from one user request.
   *  For chat: the assistant message id. For search: the search query hash. */
  traceId?: string;
  /** SDK model string passed to the provider (e.g. `claude-sonnet-4-6`). */
  model: string;
  /** Wall-clock latency in seconds. */
  latencySeconds: number;
  /** Provider-reported usage. */
  inputTokens: number;
  outputTokens: number;
  /** The full input prompt (will be truncated to ~8 KB before send). */
  input: AIMessage[];
  /** The output text from the model. */
  output: string;
  /** Optional custom properties — surfaced in the dashboard as columns. */
  properties?: Record<string, string | number | boolean | null | undefined>;
  /** Set to true if the call failed; PostHog filters error rates separately. */
  isError?: boolean;
  errorMessage?: string;
}

const MAX_FIELD_BYTES = 8 * 1024; // 8 KB cap per text field — keep events small

function truncate(text: string, max: number = MAX_FIELD_BYTES): string {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + "…[truncated]";
}

function truncateMessages(messages: AIMessage[]): AIMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: truncate(m.content),
  }));
}

/**
 * Send a `$ai_generation` event to PostHog. No-op when PostHog isn't
 * configured. Always wrapped in a try/catch — analytics must never break
 * the chat flow.
 */
export function captureGeneration(args: CaptureGenerationArgs): void {
  const ph = getPostHog();
  if (!ph) return;

  try {
    const totalCostUsd = computeLLMCost(
      args.model,
      args.inputTokens,
      args.outputTokens
    );

    ph.capture({
      distinctId: args.distinctId,
      event: "$ai_generation",
      properties: {
        // Standard $ai_* schema
        $ai_provider: modelProvider(args.model),
        $ai_model: args.model,
        $ai_input: truncateMessages(args.input),
        $ai_input_tokens: args.inputTokens,
        $ai_output_choices: [
          {
            role: "assistant",
            content: truncate(args.output),
          },
        ],
        $ai_output_tokens: args.outputTokens,
        $ai_latency: args.latencySeconds,
        $ai_total_cost_usd: totalCostUsd,
        $ai_trace_id: args.traceId,
        $ai_is_error: !!args.isError,
        $ai_error: args.errorMessage,

        // Our custom properties
        ...(args.properties ?? {}),
      },
    });
  } catch (err) {
    // Never let analytics break a real LLM call.
    console.warn("PostHog $ai_generation capture failed:", err);
  }
}
