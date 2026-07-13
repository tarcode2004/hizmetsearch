/**
 * Thin wrapper around the Cerebras inference API.
 *
 * Cerebras runs open-weight models (Llama, gpt-oss, Qwen, GLM) on their
 * custom wafer-scale hardware at ~2000 tokens/sec — roughly 10-30x faster
 * than Gemini Flash Lite for the same prompt sizes. We use it for the
 * highlight pass on search results, where the previous Gemini Flash Lite
 * implementation was the dominant search-latency cost (~30-60s for 18
 * parallel calls due to API serialization under rate limits).
 *
 * The API is OpenAI-compatible, so we hit it with plain `fetch` and skip
 * the SDK dependency. The action environment in Convex includes a global
 * fetch implementation, so this works in both Node and Edge runtimes.
 *
 * Auth: reads `CEREBRAS_API_KEY` from the Convex env. Set via
 *
 *   npx convex env set CEREBRAS_API_KEY=csk-... --prod
 *
 * Models in use:
 *   - gemma-4-31b: non-reasoning instruct model — the highlight-pass
 *     model (reasoning models burn max_tokens on chain-of-thought
 *     before emitting the formatted passage).
 *   - gpt-oss-120b: reasoning model, 131k context — default for calls
 *     that don't mind reasoning latency.
 *
 * The catalog shifts under us (llama3.1-8b and qwen-3-235b were
 * dropped in mid-2026, breaking highlights with 404s) — verify against
 * GET /v1/models before extending `CerebrasModel`.
 */

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

export type CerebrasModel =
  | "gpt-oss-120b"
  | "gemma-4-31b"
  | "zai-glm-4.7";

export interface CerebrasMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CerebrasOptions {
  model?: CerebrasModel;
  temperature?: number;
  maxTokens?: number;
  /** Per-request timeout in milliseconds. Defaults to 15s. Cerebras is
   * very fast for typical prompts so the only reason a call should
   * take more than a few seconds is a stalled network. */
  timeoutMs?: number;
}

export interface CerebrasResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Single-turn completion against Cerebras. Returns the assistant's
 * text plus token counts for usage tracking. Throws on HTTP error,
 * timeout, or empty response — callers should wrap in try/catch and
 * fall back gracefully (e.g. return the original chunk text instead
 * of a highlighted version).
 */
export async function cerebrasComplete(
  messages: CerebrasMessage[],
  options: CerebrasOptions = {},
): Promise<CerebrasResult> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY is not set on this Convex deployment");
  }
  const model = options.model ?? "gpt-oss-120b";
  const timeoutMs = options.timeoutMs ?? 15_000;

  // AbortController-based timeout. fetch will throw AbortError on
  // timeout, which the caller can recognize via err.name === "AbortError"
  // if it wants to distinguish slow Cerebras from a real failure.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const resp = await fetch(`${CEREBRAS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 1024,
        stream: false,
      }),
      signal: ac.signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(
        `Cerebras ${model} returned ${resp.status}: ${body.slice(0, 300)}`,
      );
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error(`Cerebras ${model} returned empty completion`);
    }

    return {
      text,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? model,
    };
  } finally {
    clearTimeout(timer);
  }
}
