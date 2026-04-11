import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquarePlus, X } from "lucide-react";
import { FeedbackForm } from "./FeedbackForm";
import { cn } from "@/lib/utils";

/**
 * Globally-available "Send feedback" button. Lives in the bottom-right
 * corner of every page that mounts the AppShell. Click opens a modal
 * with the FeedbackForm. Closes on Escape, on backdrop click, or on
 * successful submission (with a brief thank-you delay).
 *
 * Hidden on `/source/*` because that route opens in its own tab and
 * has its own header — no room for the corner button.
 */
export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Don't render on routes where the fixed button overlaps other
  // controls: the source viewer (new-tab route with its own header)
  // and the chat page (the send-message button sits in the same
  // bottom-right corner on mobile).
  if (pathname.startsWith("/source/") || pathname.startsWith("/chat")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Send feedback"
        className={cn(
          "fixed bottom-4 right-4 z-40 flex h-10 items-center gap-1.5",
          "rounded-full border border-border bg-card px-3 text-xs font-medium",
          "text-muted-foreground shadow-[var(--shadow-md)]",
          "hover:text-foreground hover:bg-muted hover:border-primary/30",
          "transition-all",
        )}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2
                  className="text-sm font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Send us feedback
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Bug reports, feature ideas, content corrections — we read everything.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <FeedbackForm
                bare
                onSuccess={() => {
                  setTimeout(() => setOpen(false), 1500);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
