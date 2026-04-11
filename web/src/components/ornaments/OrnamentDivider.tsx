import { cn } from "@/lib/utils";

interface OrnamentDividerProps {
  className?: string;
  /** Width in pixels of the center ornament */
  size?: number;
}

/**
 * Subtle Ottoman-inspired horizontal divider. Two thin rules flanking
 * a small diamond-and-dot ornament in the center. Reads as "this is a
 * scholarly surface" without being gaudy.
 *
 * Used sparingly: between home page sections, between chat conversation
 * days, above the pricing support section.
 */
export function OrnamentDivider({ className, size = 32 }: OrnamentDividerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-muted-foreground/40",
        className
      )}
      role="separator"
      aria-hidden="true"
    >
      <div className="h-px flex-1 bg-current" />
      <svg
        width={size}
        height={size / 3}
        viewBox="0 0 96 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Left dot */}
        <circle cx="14" cy="16" r="1.5" fill="currentColor" />
        {/* Left line into diamond */}
        <line
          x1="22"
          y1="16"
          x2="38"
          y2="16"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Center diamond */}
        <path
          d="M48 8 L56 16 L48 24 L40 16 Z"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Inner diamond accent */}
        <circle cx="48" cy="16" r="1.5" fill="currentColor" />
        {/* Right line into diamond */}
        <line
          x1="58"
          y1="16"
          x2="74"
          y2="16"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Right dot */}
        <circle cx="82" cy="16" r="1.5" fill="currentColor" />
      </svg>
      <div className="h-px flex-1 bg-current" />
    </div>
  );
}
