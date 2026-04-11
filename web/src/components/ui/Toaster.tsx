import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
import { useTheme } from "@/lib/theme/ThemeProvider";

/**
 * Sonner toaster wired to the HizmetSearch theme system.
 * Mount once at the root of the app (in App.tsx).
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border border-border bg-card text-card-foreground font-sans shadow-[var(--shadow-lg)]",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          actionButton:
            "bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium",
          cancelButton:
            "bg-muted text-foreground rounded-md px-2.5 py-1 text-xs font-medium",
        },
      }}
    />
  );
}

export const toast = sonnerToast;
