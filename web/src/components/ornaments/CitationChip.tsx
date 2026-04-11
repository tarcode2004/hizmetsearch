import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

interface CitationChipProps {
  number: number;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  /** Optional rich hover tooltip (Radix). Replaces the native `title` attr when set. */
  tooltip?: ReactNode;
}

/**
 * Gilt-gold citation chip. Used inline in AI answers and chat messages
 * to replace raw `[N]` markers with something more beautiful and
 * deliberately clickable.
 *
 * Styled via `.citation-chip` in index.css so the same look appears
 * everywhere without prop drilling.
 */
export const CitationChip = forwardRef<HTMLAnchorElement, CitationChipProps>(
  function CitationChip(
    { number, onClick, href, title, children, className, target, rel, tooltip },
    ref
  ) {
    const content = children ?? number;

    const chip = href ? (
      <a
        ref={ref}
        href={href}
        onClick={onClick}
        title={tooltip ? undefined : title}
        target={target}
        rel={rel}
        className={cn("citation-chip", className)}
        aria-label={`Citation ${number}`}
      >
        {content}
      </a>
    ) : (
      <button
        type="button"
        onClick={onClick}
        title={tooltip ? undefined : title}
        className={cn("citation-chip", className)}
        aria-label={`Citation ${number}`}
      >
        {content}
      </button>
    );

    if (tooltip) {
      return (
        <Tooltip content={tooltip} side="top" className="max-w-[320px] p-0">
          {chip}
        </Tooltip>
      );
    }
    return chip;
  }
);
