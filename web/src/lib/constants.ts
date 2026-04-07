export const LANGUAGE_LABELS: Record<string, string> = {
  tr: "Türkçe",
  ar: "العربية",
  en: "English",
  "tr+ar": "TR+AR",
  ota: "Osmanlıca",
};

export const LANGUAGE_FLAGS: Record<string, string> = {
  tr: "🇹🇷",
  ar: "🇸🇦",
  en: "🇬🇧",
  "tr+ar": "🇹🇷🇸🇦",
  ota: "🏛️",
};

export const SOURCE_TYPE_ICONS: Record<string, string> = {
  text: "BookOpen",
  audio: "Headphones",
  video: "Video",
  scanned: "ScanLine",
};

export const MODEL_INFO = {
  gemini: {
    name: "Gemini",
    subtitle: "Exploration",
    description: "Broader theological connections, creative synthesis",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  claude: {
    name: "Claude",
    subtitle: "Precision",
    description: "Strictly citation-grounded, low hallucination",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
  },
} as const;
