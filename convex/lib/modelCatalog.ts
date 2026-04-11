/**
 * Single source of truth for the LLM model variants exposed in the UI.
 *
 * Imported by:
 *   - `web/src/components/chat/ModelSelector.tsx` to render the dropdown
 *   - `convex/actions/chat.ts` to map a variant id → SDK model string
 *
 * When you change this list, no schema migration is needed: the schema
 * stores `modelVariant: v.optional(v.string())` and accepts any value.
 *
 * Model ids verified against:
 *   - https://ai.google.dev/gemini-api/docs/models
 *   - https://platform.claude.com/docs/en/docs/about-claude/models/overview
 * (last checked 2026-04-08)
 */

export type ModelFamily = "gemini" | "claude";

export interface ModelVariant {
  /** Stable id used as the SDK model string AND stored on `messages.modelVariant`. */
  id: string;
  family: ModelFamily;
  /** Display name shown in the UI. */
  label: string;
  /** Optional subtitle / tagline. */
  subtitle?: string;
  /** True for the family's default pick when nothing is selected. */
  isDefault?: boolean;
}

export const MODEL_VARIANTS: ModelVariant[] = [
  // ── Claude (current 4.6 generation) ────────────────────────────
  {
    id: "claude-opus-4-6",
    family: "claude",
    label: "Claude Opus 4.6",
    subtitle: "Deepest reasoning + coding",
  },
  {
    id: "claude-sonnet-4-6",
    family: "claude",
    label: "Claude Sonnet 4.6",
    subtitle: "Best speed + intelligence",
    isDefault: true,
  },
  {
    id: "claude-haiku-4-5",
    family: "claude",
    label: "Claude Haiku 4.5",
    subtitle: "Fastest, near-frontier",
  },

  // ── Gemini 3.x preview (frontier, may require billing) ─────────
  {
    id: "gemini-3.1-pro-preview",
    family: "gemini",
    label: "Gemini 3.1 Pro",
    subtitle: "Frontier reasoning · preview",
  },
  {
    id: "gemini-3-flash-preview",
    family: "gemini",
    label: "Gemini 3 Flash",
    subtitle: "Frontier perf, lower cost · preview",
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    family: "gemini",
    label: "Gemini 3.1 Flash Lite",
    subtitle: "Cheapest frontier model · preview",
  },

  // ── Gemini 2.5 (stable, generous free tier) ────────────────────
  {
    id: "gemini-2.5-pro",
    family: "gemini",
    label: "Gemini 2.5 Pro",
    subtitle: "Deep reasoning",
  },
  {
    id: "gemini-2.5-flash",
    family: "gemini",
    label: "Gemini 2.5 Flash",
    subtitle: "Fast all-rounder",
    isDefault: true,
  },
  {
    id: "gemini-2.5-flash-lite",
    family: "gemini",
    label: "Gemini 2.5 Flash Lite",
    subtitle: "Cheapest, multimodal",
  },
];

export function variantsForFamily(family: ModelFamily): ModelVariant[] {
  return MODEL_VARIANTS.filter((v) => v.family === family);
}

export function defaultVariantId(family: ModelFamily): string {
  return (
    MODEL_VARIANTS.find((v) => v.family === family && v.isDefault)?.id ??
    MODEL_VARIANTS.find((v) => v.family === family)!.id
  );
}

/** Resolve a variant id (or undefined) to the SDK model string for a family. */
export function resolveModelId(
  family: ModelFamily,
  variantId: string | undefined
): string {
  if (variantId && MODEL_VARIANTS.some((v) => v.id === variantId && v.family === family)) {
    return variantId;
  }
  return defaultVariantId(family);
}
