import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Styled `<kbd>` for keyboard shortcuts.
 * Uses JetBrains Mono for a scholarly-tech feel.
 */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center",
        "rounded-md border border-border bg-muted/60",
        "px-1.5 min-w-[1.25rem] h-[1.25rem]",
        "font-mono text-[10px] font-medium text-muted-foreground",
        "shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]",
        className
      )}
    >
      {children}
    </kbd>
  );
}
