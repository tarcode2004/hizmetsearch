import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Returns true only when the text is *predominantly* Arabic (>= 30% of
 * letter characters are in the Arabic Unicode blocks).
 *
 * Used to decide `dir="rtl"` on message bubbles, search results, and
 * citation tooltips. A simple "any Arabic char" check (the previous
 * implementation) would flip an entire English paragraph to RTL the
 * moment it contained a single Arabic word like "مرحبا" or a quoted
 * verse — which produced jarring layouts.
 */
export function detectArabicScript(text: string): boolean {
  if (!text) return false;
  // Count letters in each script. Punctuation, spaces, digits don't count.
  const arabicMatches = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  const latinMatches = text.match(/[A-Za-zÀ-ÿĀ-žıİğĞşŞçÇöÖüÜ]/g);
  const arabic = arabicMatches?.length ?? 0;
  const latin = latinMatches?.length ?? 0;
  if (arabic === 0) return false;
  if (latin === 0) return true;
  return arabic / (arabic + latin) >= 0.3;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
