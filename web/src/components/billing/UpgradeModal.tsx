import { X, Sparkles, Crown, Key } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <Sparkles className="h-7 w-7 text-amber-600" />
          </div>

          <h2 className="text-lg font-bold text-foreground">
            Token Limitinize Ulaştınız
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bu ay için kullanılabilir tokenlarınız doldu. Devam etmek için planınızı yükseltin veya kendi API anahtarınızı ekleyin.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Link
            to="/pricing"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
          >
            <Crown className="h-4 w-4" />
            Planları Gör
          </Link>

          <Link
            to="/settings"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground no-underline hover:bg-muted transition-colors"
          >
            <Key className="h-4 w-4" />
            Kendi Anahtarımı Kullan (BYOK)
          </Link>

          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Daha sonra
          </button>
        </div>
      </div>
    </div>
  );
}
