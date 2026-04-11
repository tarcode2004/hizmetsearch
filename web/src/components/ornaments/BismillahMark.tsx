import { cn } from "@/lib/utils";

interface BismillahMarkProps {
  className?: string;
  size?: number;
}

/**
 * A tiny decorative mark rendered on the source viewer header for
 * Risale-i Nur sources. Geometric interpretation, NOT calligraphy.
 *
 * It's a small stylized star-of-eight with a center dot — a motif
 * common in Ottoman manuscript illumination. Used purely as a visual
 * signature, never as a religious symbol or substitute for actual
 * calligraphy.
 */
export function BismillahMark({ className, size = 16 }: BismillahMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-gilt", className)}
      style={{ color: "var(--color-gilt)" }}
      aria-hidden="true"
    >
      {/* Outer 8-point star */}
      <path
        d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      {/* Rotated square (creates the 8-point illusion) */}
      <path
        d="M12 5 L19 12 L12 19 L5 12 Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Center dot */}
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  );
}
