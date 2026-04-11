import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Repeat,
  Gauge,
  AlertTriangle,
  Download,
} from "lucide-react";
import { cn, detectArabicScript, formatTimestamp } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { Kbd } from "@/components/ui/Kbd";

interface AudioViewerProps {
  sourceUrl: string;
  chunkText: string;
  timestampStart: number | null;
  timestampEnd: number | null;
  section?: string | null;
  /** Called with a seek function so the parent route can programmatically
   *  play from a specific timestamp (e.g. when the user clicks "Play chunk"
   *  in the ChunkPanel). */
  onSeekReady?: (fn: (t: number) => void) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Full custom audio player for the source viewer.
 *
 * Features:
 * - Deterministic waveform visualization with a gilt band over the
 *   cited chunk range
 * - Playback speed (0.75x - 2x)
 * - A-B loop (click-click to set A and B, then loops forever)
 * - 15s skip back / forward
 * - Volume + mute
 * - Keyboard: Space = play/pause, ← → = 5s, J L = 15s, K = pause
 */
export function AudioViewer({
  sourceUrl,
  chunkText,
  timestampStart,
  timestampEnd,
  section,
  onSeekReady,
}: AudioViewerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(timestampStart ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const isArabic = detectArabicScript(chunkText);
  // Browsers can't natively decode .flv (Flash Video) — there is no
  // HTML5 codec for it. The chunker keeps the original ext from R2 so
  // some audio chunks come through as .flv. Detect that and surface a
  // clear download-only fallback instead of silently failing on play.
  const ext = (sourceUrl.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const isUnsupportedFormat = ext === "flv";

  // Attach listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMeta = () => {
      setDuration(audio.duration);
      if (timestampStart != null) audio.currentTime = timestampStart;
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [timestampStart]);

  // A-B loop
  useEffect(() => {
    if (loopA == null || loopB == null) return;
    if (currentTime > loopB) {
      const audio = audioRef.current;
      if (audio) audio.currentTime = loopA;
    }
  }, [currentTime, loopA, loopB]);

  // Apply volume + speed
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  // Expose seek function. We accept null/0 here so the parent can call
  // it even when the chunk has no recorded timestamp — in that case we
  // just rewind to the start so the user can step forward manually.
  useEffect(() => {
    if (!onSeekReady) return;
    onSeekReady((t: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const target = Number.isFinite(t) && t > 0 ? t : 0;
      try {
        audio.currentTime = target;
        const p = audio.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch((err) =>
            console.warn("audio.play() rejected:", err),
          );
        }
      } catch (err) {
        console.warn("audio seek failed:", err);
      }
    });
  }, [onSeekReady]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const audio = audioRef.current;
      if (!audio) return;

      if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (audio.paused) audio.play();
        else audio.pause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - (e.shiftKey ? 30 : 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        audio.currentTime = Math.min(
          audio.duration,
          audio.currentTime + (e.shiftKey ? 30 : 5)
        );
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 15);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Deterministic waveform — seeded by sourceUrl so it's stable
  const waveformBars = useMemo(() => {
    const seed = sourceUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const bars: number[] = [];
    let s = seed;
    for (let i = 0; i < 140; i++) {
      s = (s * 9301 + 49297) % 233280;
      const base = 0.3 + (s / 233280) * 0.7;
      // Add some variation to make it more waveform-like
      const variation = Math.sin(i * 0.15) * 0.15;
      bars.push(Math.max(0.15, Math.min(1, base + variation)));
    }
    return bars;
  }, [sourceUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(
      0,
      Math.min(audio.duration || Infinity, audio.currentTime + delta)
    );
  };

  const seekTo = (pct: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(duration, pct * duration));
  };

  const handleLoopClick = () => {
    if (loopA == null) {
      setLoopA(currentTime);
    } else if (loopB == null) {
      if (currentTime > loopA) {
        setLoopB(currentTime);
      } else {
        setLoopA(currentTime);
      }
    } else {
      setLoopA(null);
      setLoopB(null);
    }
  };

  const loopActive = loopA != null && loopB != null;
  const loopPending = loopA != null && loopB == null;

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto">
      {!isUnsupportedFormat && (
        <audio ref={audioRef} src={sourceUrl} preload="metadata" />
      )}

      <div className="flex w-full max-w-3xl flex-col gap-6 px-6 py-10 sm:py-16">
        {isUnsupportedFormat && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 text-[12px] text-amber-800 dark:text-amber-200">
                <div className="font-semibold">
                  Browsers can't play this format ({ext.toUpperCase()})
                </div>
                <p className="mt-0.5 leading-relaxed">
                  This is a legacy Flash audio file. We're working on
                  transcoding the audio archive to MP3 — for now you can
                  download the original to listen with VLC.
                </p>
                <a
                  href={sourceUrl}
                  download
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white no-underline hover:bg-amber-700 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Download original
                </a>
              </div>
            </div>
          </div>
        )}
        {/* ─── Header info ─── */}
        <div className="text-center">
          <div
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-lg)]"
            style={{
              background: "linear-gradient(135deg, oklch(62% 0.18 280), var(--color-primary))",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </div>
          {section && (
            <div
              className="text-sm text-muted-foreground"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              {section}
            </div>
          )}
        </div>

        {/* ─── Waveform ─── */}
        <div className="relative">
          <div
            className="flex h-20 cursor-pointer items-center gap-[2px] rounded-xl border border-border bg-card/40 px-3 py-2"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
          >
            {waveformBars.map((h, i) => {
              const pct = i / waveformBars.length;
              const played = duration > 0 && pct < currentTime / duration;
              const inChunk =
                timestampStart != null &&
                timestampEnd != null &&
                duration > 0 &&
                pct >= timestampStart / duration &&
                pct <= timestampEnd / duration;
              const inLoop =
                loopA != null &&
                loopB != null &&
                duration > 0 &&
                pct >= loopA / duration &&
                pct <= loopB / duration;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-colors"
                  style={{
                    height: `${h * 100}%`,
                    background: inLoop
                      ? "var(--color-primary)"
                      : inChunk
                        ? played
                          ? "var(--color-gilt-deep)"
                          : "var(--color-gilt)"
                        : played
                          ? "var(--color-primary)"
                          : "var(--color-border)",
                    opacity: inChunk ? 1 : played ? 0.9 : 0.5,
                  }}
                />
              );
            })}
          </div>
          {/* Time labels */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <span>{formatTimestamp(currentTime)}</span>
            {timestampStart != null && timestampEnd != null && (
              <span className="flex items-center gap-1" style={{ color: "var(--color-gilt-deep)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-gilt)" }} />
                Cited: {formatTimestamp(timestampStart)} – {formatTimestamp(timestampEnd)}
              </span>
            )}
            <span>{formatTimestamp(duration || 0)}</span>
          </div>
        </div>

        {/* ─── Transport controls ─── */}
        <div className="flex items-center justify-center gap-2">
          {/* Speed */}
          <Tooltip content="Playback speed" side="top">
            <div className="relative">
              <select
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-card pl-7 pr-3 text-xs font-mono text-foreground hover:bg-muted transition-colors"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
              <Gauge className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Tooltip>

          <Tooltip content={<span>Skip back 15s <Kbd>J</Kbd></span>} side="top">
            <button
              onClick={() => skip(-15)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Skip back 15 seconds"
            >
              <SkipBack className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* Play / pause */}
          <Tooltip content={<span>{isPlaying ? "Pause" : "Play"} <Kbd>space</Kbd></span>} side="top">
            <button
              onClick={togglePlay}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-md)] hover:bg-primary/90 active:scale-[0.96] transition-all"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current translate-x-0.5" />
              )}
            </button>
          </Tooltip>

          <Tooltip content={<span>Skip forward 15s <Kbd>L</Kbd></span>} side="top">
            <button
              onClick={() => skip(15)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Skip forward 15 seconds"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* A-B loop */}
          <Tooltip
            content={
              loopActive
                ? "Clear A-B loop"
                : loopPending
                  ? "Set B point (click to finish)"
                  : "Set A point for A-B loop"
            }
            side="top"
          >
            <button
              onClick={handleLoopClick}
              className={cn(
                "flex h-10 px-3 items-center gap-1.5 rounded-full text-xs font-medium transition-colors",
                loopActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : loopPending
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-label="A-B loop"
            >
              <Repeat className="h-3.5 w-3.5" />
              {loopActive
                ? "A–B"
                : loopPending
                  ? "A"
                  : "Loop"}
            </button>
          </Tooltip>
        </div>

        {/* Volume row */}
        <div className="mx-auto flex w-60 items-center gap-2">
          <button
            onClick={() => setMuted(!muted)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              setMuted(false);
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            aria-label="Volume"
          />
        </div>

        {/* Highlighted chunk (also visible in the side panel, but here for solo use) */}
        <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-primary">
              Cited passage
            </span>
            {timestampStart != null && timestampEnd != null && (
              <span className="font-mono text-muted-foreground">
                {formatTimestamp(timestampStart)} – {formatTimestamp(timestampEnd)}
              </span>
            )}
          </div>
          <p
            dir={isArabic ? "rtl" : "ltr"}
            className={cn(
              "text-sm leading-relaxed text-foreground/90",
              isArabic && "font-[var(--font-arabic)] text-base"
            )}
            style={
              !isArabic
                ? { fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 500 }
                : undefined
            }
          >
            {chunkText}
          </p>
        </div>
      </div>
    </div>
  );
}
