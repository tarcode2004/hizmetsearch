import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  className?: string;
}

/**
 * Radix Tooltip wrapped with consistent HizmetSearch styling.
 * All tooltips share a 200ms delay and the same elevation.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={8}
            className={cn(
              "z-50 overflow-hidden rounded-lg",
              "border border-border bg-card text-card-foreground",
              "px-2.5 py-1.5 text-xs font-medium",
              "shadow-[var(--shadow-md)]",
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
              className
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-card stroke-border" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
