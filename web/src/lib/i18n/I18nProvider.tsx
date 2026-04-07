import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

interface I18nContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nCtx = createContext<I18nContext | null>(null);

const STORAGE_KEY = "hizmetsearch.locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "tr";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "tr" || stored === "en") return stored;
  // Detect from browser
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("en")) return "en";
  return "tr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  };

  const t = (key: TranslationKey): string => {
    return translations[locale][key] ?? translations.tr[key] ?? key;
  };

  return (
    <I18nCtx.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
