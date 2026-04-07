import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { HomePage } from "@/routes/index";
import { SearchPage } from "@/routes/search";
import { ChatPage } from "@/routes/chat";
import { PricingPage } from "@/routes/pricing";
import { SettingsPage } from "@/routes/settings";
import { trackPageView } from "@/lib/analytics";
import { UpgradePopupProvider } from "@/lib/upgrade/UpgradePopupProvider";

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <UpgradePopupProvider>
        <PageTracker />
        <div className="min-h-screen bg-background">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </UpgradePopupProvider>
    </BrowserRouter>
  );
}
