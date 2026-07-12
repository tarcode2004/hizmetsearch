import { forwardRef, useEffect, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslation } from "@/lib/i18n/I18nProvider";

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
 * True on touch-first devices (no hover, coarse pointer). Hover
 * tooltips are unreachable there, so citation chips switch to a
 * tap-to-open popover instead.
 */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    // Older Safari exposes addListener only.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  return coarse;
}

/**
 * Gilt-gold citation chip. Used inline in AI answers and chat messages
 * to replace raw `[N]` markers with something more beautiful and
 * deliberately clickable.
 *
 * Styled via `.citation-chip` in index.css so the same look appears
 * everywhere without prop drilling.
 *
 * Pointer behavior:
 * - Fine pointer (mouse): hover shows the rich source tooltip; click
 *   navigates (or runs the host's onClick, e.g. in-page preview).
 * - Coarse pointer (touch): first tap opens the same source card as a
 *   popover; an explicit "Open source" action inside it navigates.
 */
export const CitationChip = forwardRef<HTMLAnchorElement, CitationChipProps>(
  function CitationChip(
    { number, onClick, href, title, children, className, target, rel, tooltip },
    ref
  ) {
    const { t } = useTranslation();
    const coarsePointer = useCoarsePointer();
    const content = children ?? number;

    // Touch devices: tap opens the source popover instead of navigating.
    if (tooltip && coarsePointer) {
      return (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn("citation-chip", className)}
              aria-label={`Citation ${number}`}
            >
              {content}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={8}
              collisionPadding={12}
              className={cn(
                "z-50 max-w-[calc(100vw-24px)] overflow-hidden rounded-lg",
                "border border-border bg-card text-card-foreground",
                "shadow-[var(--shadow-md)]"
              )}
            >
              {tooltip}
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-center gap-1.5",
                    "border-t border-border bg-muted/40 px-3 py-2",
                    "text-xs font-medium text-primary no-underline"
                  )}
                >
                  {t("citation.openSource")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Popover.Arrow className="fill-card stroke-border" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      );
    }

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
