import { useState, useRef, useCallback } from "react";

interface TTSHook {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  speak: (text: string, lang?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  voices: SpeechSynthesisVoice[];
}

export function useTextToSpeech(): TTSHook {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load voices
  if (isSupported && voices.length === 0) {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  const getVoiceForLanguage = useCallback(
    (lang: string): SpeechSynthesisVoice | null => {
      const langMap: Record<string, string[]> = {
        tr: ["tr-TR", "tr"],
        ar: ["ar-SA", "ar"],
        en: ["en-US", "en-GB", "en"],
      };
      const candidates = langMap[lang] ?? [lang];

      for (const candidate of candidates) {
        // Prefer Google / premium voices
        const premium = voices.find(
          (v) =>
            v.lang.startsWith(candidate) &&
            (v.name.includes("Google") || v.name.includes("Premium") || v.name.includes("Enhanced"))
        );
        if (premium) return premium;
      }

      for (const candidate of candidates) {
        const match = voices.find((v) => v.lang.startsWith(candidate));
        if (match) return match;
      }

      return null;
    },
    [voices]
  );

  const speak = useCallback(
    (text: string, lang: string = "tr") => {
      if (!isSupported) return;

      // Cancel any ongoing speech
      speechSynthesis.cancel();

      // Clean text: remove markdown, citations
      const cleanText = text
        .replace(/\*\*/g, "")
        .replace(/\[(\d+)\]/g, "")
        .replace(/#{1,6}\s/g, "")
        .replace(/\[.*?\]\(.*?\)/g, "")
        .trim();

      // Split long text into chunks at sentence boundaries
      const sentences = cleanText.match(/[^.!?。؟]+[.!?。؟]+/g) ?? [cleanText];
      const chunks: string[] = [];
      let current = "";

      for (const sentence of sentences) {
        if ((current + sentence).length > 200) {
          if (current) chunks.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current) chunks.push(current.trim());

      const voice = getVoiceForLanguage(lang);
      let chunkIndex = 0;

      const speakNext = () => {
        if (chunkIndex >= chunks.length) {
          setIsSpeaking(false);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang ?? `${lang}-${lang.toUpperCase()}`;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        utterance.onend = () => {
          chunkIndex++;
          speakNext();
        };

        utterance.onerror = () => {
          setIsSpeaking(false);
        };

        utteranceRef.current = utterance;
        speechSynthesis.speak(utterance);
      };

      setIsSpeaking(true);
      setIsPaused(false);
      speakNext();
    },
    [isSupported, getVoiceForLanguage]
  );

  const pause = useCallback(() => {
    if (isSupported) {
      speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (isSupported) {
      speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [isSupported]);

  return { isSpeaking, isPaused, isSupported, speak, pause, resume, stop, voices };
}
