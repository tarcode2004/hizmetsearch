import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Globe,
  RotateCcw,
} from "lucide-react";
import { cn, detectArabicScript, truncate } from "@/lib/utils";
import { AudioVisualizer } from "./AudioVisualizer";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { MOCK_RESULTS, MOCK_AI_ANSWER } from "@/lib/mock-data";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";
type VoiceLang = "tr-TR" | "ar-SA" | "en-US";

interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  lang: string;
  sources?: typeof MOCK_RESULTS;
}

const LANG_OPTIONS: { code: VoiceLang; label: string; flag: string }[] = [
  { code: "tr-TR", label: "Türkçe", flag: "🇹🇷" },
  { code: "ar-SA", label: "العربية", flag: "🇸🇦" },
  { code: "en-US", label: "English", flag: "🇬🇧" },
];

export function VoiceChat() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [language, setLanguage] = useState<VoiceLang>("tr-TR");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const stt = useSpeechRecognition();
  const tts = useTextToSpeech();
  const levelIntervalRef = useRef<number>(0);

  // Simulate audio level when listening
  useEffect(() => {
    if (voiceState === "listening") {
      levelIntervalRef.current = window.setInterval(() => {
        setAudioLevel(Math.random() * 0.7 + (stt.isListening ? 0.2 : 0));
      }, 80);
    } else if (voiceState === "speaking") {
      levelIntervalRef.current = window.setInterval(() => {
        setAudioLevel(Math.random() * 0.5 + 0.2);
      }, 80);
    } else {
      setAudioLevel(0);
    }
    return () => clearInterval(levelIntervalRef.current);
  }, [voiceState, stt.isListening]);

  // When TTS finishes speaking, go back to idle
  useEffect(() => {
    if (voiceState === "speaking" && !tts.isSpeaking) {
      setVoiceState("idle");
    }
  }, [tts.isSpeaking, voiceState]);

  const handleStartListening = () => {
    stt.reset();
    stt.start(language);
    setVoiceState("listening");
  };

  const handleStopListening = () => {
    stt.stop();
    const userText = stt.transcript.trim();

    if (!userText) {
      setVoiceState("idle");
      return;
    }

    // Add user message
    const userMsg: VoiceMessage = {
      id: `v-${Date.now()}`,
      role: "user",
      text: userText,
      lang: stt.detectedLanguage,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Simulate thinking + RAG response
    setVoiceState("thinking");
    setTimeout(() => {
      const assistantMsg: VoiceMessage = {
        id: `v-${Date.now() + 1}`,
        role: "assistant",
        text: MOCK_AI_ANSWER.replace(/\[\d+\]/g, "").replace(/\*\*/g, ""),
        lang: stt.detectedLanguage,
        sources: MOCK_RESULTS,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Start speaking
      setVoiceState("speaking");
      const ttsLang = stt.detectedLanguage === "ar" ? "ar" : stt.detectedLanguage === "en" ? "en" : "tr";
      tts.speak(assistantMsg.text, ttsLang);
    }, 1500);
  };

  const handleStopSpeaking = () => {
    tts.stop();
    setVoiceState("idle");
  };

  const handleReset = () => {
    tts.stop();
    stt.reset();
    setMessages([]);
    setVoiceState("idle");
  };

  const modeLabel = {
    idle: "Başlamak için mikrofona dokunun",
    listening: "Dinleniyor...",
    thinking: "Düşünüyor...",
    speaking: "Konuşuyor...",
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header controls */}
      <div className="flex w-full max-w-md items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          {LANG_OPTIONS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                language === l.code
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <span>{l.flag}</span>
              <span className="hidden sm:inline">{l.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Metin göster/gizle"
          >
            <Globe className="h-4 w-4" />
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Sıfırla"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Visualizer area */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {/* Audio visualizer orb */}
        <div className="relative mb-6">
          <AudioVisualizer
            audioLevel={audioLevel}
            isActive={voiceState !== "idle"}
            mode={voiceState}
            size={220}
          />

          {/* Central icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            {voiceState === "idle" && (
              <Mic className="h-10 w-10 text-white/80" />
            )}
            {voiceState === "listening" && (
              <div className="flex flex-col items-center">
                <Mic className="h-8 w-8 text-white animate-pulse" />
              </div>
            )}
            {voiceState === "thinking" && (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2.5 w-2.5 rounded-full bg-white/80 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
            {voiceState === "speaking" && (
              <Volume2 className="h-8 w-8 text-white animate-pulse" />
            )}
          </div>
        </div>

        {/* Status text */}
        <p className={cn(
          "mb-2 text-sm font-medium transition-colors",
          voiceState === "listening" ? "text-primary" :
          voiceState === "thinking" ? "text-accent" :
          voiceState === "speaking" ? "text-blue-600" :
          "text-muted-foreground"
        )}>
          {modeLabel[voiceState]}
        </p>

        {/* Live transcript */}
        {showTranscript && voiceState === "listening" && (
          <div className="mx-4 max-w-md rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3 text-center">
            <p className={cn(
              "text-sm text-foreground",
              detectArabicScript(stt.transcript + stt.interimTranscript) && "font-[var(--font-arabic)] text-base"
            )}>
              {stt.transcript}
              <span className="text-muted-foreground/60">{stt.interimTranscript}</span>
              {!stt.transcript && !stt.interimTranscript && (
                <span className="text-muted-foreground">Konuşmaya başlayın...</span>
              )}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex items-center gap-4">
          {voiceState === "idle" && (
            <button
              onClick={handleStartListening}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 active:scale-95"
            >
              <Mic className="h-7 w-7" />
            </button>
          )}

          {voiceState === "listening" && (
            <button
              onClick={handleStopListening}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all hover:bg-red-600 hover:scale-105 active:scale-95 animate-pulse"
            >
              <Square className="h-6 w-6" />
            </button>
          )}

          {voiceState === "thinking" && (
            <button
              disabled
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent shadow-lg cursor-not-allowed"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </button>
          )}

          {voiceState === "speaking" && (
            <button
              onClick={handleStopSpeaking}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-all hover:bg-blue-600 hover:scale-105 active:scale-95"
            >
              <VolumeX className="h-7 w-7" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation transcript & sources panel */}
      {messages.length > 0 && showTranscript && (
        <div className="w-full max-w-lg border-t border-border bg-card/50 backdrop-blur-sm">
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {messages.length} mesaj / {messages.filter((m) => m.sources).length} kaynaklı cevap
            </span>
            {showSources ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>

          {showSources && (
            <div className="max-h-48 overflow-y-auto px-4 pb-3">
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs",
                      msg.role === "user"
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold">
                        {msg.role === "user" ? "Siz" : "AI"}
                      </span>
                      <LanguageBadge language={msg.lang} />
                    </div>
                    <p className={cn(
                      detectArabicScript(msg.text) && "font-[var(--font-arabic)] text-sm"
                    )}>
                      {truncate(msg.text, 200)}
                    </p>
                    {msg.sources && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {msg.sources.length} kaynak kullanıldı
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
