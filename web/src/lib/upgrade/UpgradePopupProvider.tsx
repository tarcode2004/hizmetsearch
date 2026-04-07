import { createContext, useContext, useState, type ReactNode } from "react";
import { UpgradePopup, type UpgradeReason } from "@/components/billing/UpgradePopup";

interface UpgradePopupContext {
  show: (reason: UpgradeReason) => void;
  hide: () => void;
}

const Ctx = createContext<UpgradePopupContext | null>(null);

export function UpgradePopupProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<UpgradeReason>("free-to-pro");

  const show = (r: UpgradeReason) => {
    setReason(r);
    setOpen(true);
  };

  const hide = () => setOpen(false);

  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      <UpgradePopup open={open} reason={reason} onClose={hide} />
    </Ctx.Provider>
  );
}

export function useUpgradePopup() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUpgradePopup must be used within UpgradePopupProvider");
  return ctx;
}
