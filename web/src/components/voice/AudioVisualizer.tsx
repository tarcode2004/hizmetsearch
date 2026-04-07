import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AudioVisualizerProps {
  audioLevel: number;
  isActive: boolean;
  mode: "listening" | "thinking" | "speaking" | "idle";
  size?: number;
}

const MODE_COLORS = {
  listening: { from: "#0d6e4f", to: "#10b981" },
  thinking: { from: "#d4a853", to: "#f59e0b" },
  speaking: { from: "#3b82f6", to: "#8b5cf6" },
  idle: { from: "#a8a29e", to: "#d6d3d1" },
};

export function AudioVisualizer({ audioLevel, isActive, mode, size = 200 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = size * 0.28;
    const colors = MODE_COLORS[mode];

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      phaseRef.current += isActive ? 0.03 : 0.008;

      const numRings = 3;
      for (let ring = numRings - 1; ring >= 0; ring--) {
        const ringScale = 1 + ring * 0.18;
        const ringAlpha = 0.12 - ring * 0.03;
        const amplitude = isActive ? audioLevel * 30 + 5 : 3;

        ctx.beginPath();
        for (let i = 0; i <= 360; i++) {
          const angle = (i * Math.PI) / 180;
          const noise =
            Math.sin(angle * 3 + phaseRef.current * (1 + ring * 0.5)) * amplitude * 0.6 +
            Math.sin(angle * 5 - phaseRef.current * 0.7) * amplitude * 0.3 +
            Math.sin(angle * 7 + phaseRef.current * 1.3) * amplitude * 0.1;
          const r = baseRadius * ringScale + noise;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const gradient = ctx.createRadialGradient(center, center, 0, center, center, baseRadius * ringScale + 30);
        gradient.addColorStop(0, `${colors.from}${Math.round(ringAlpha * 255).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(1, `${colors.to}${Math.round(ringAlpha * 128).toString(16).padStart(2, "0")}`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Center orb
      const orbPulse = isActive ? 1 + audioLevel * 0.15 : 1 + Math.sin(phaseRef.current) * 0.03;
      const orbRadius = baseRadius * 0.65 * orbPulse;

      const orbGradient = ctx.createRadialGradient(
        center - orbRadius * 0.2,
        center - orbRadius * 0.2,
        0,
        center,
        center,
        orbRadius
      );
      orbGradient.addColorStop(0, colors.to + "ff");
      orbGradient.addColorStop(0.7, colors.from + "ee");
      orbGradient.addColorStop(1, colors.from + "88");

      ctx.beginPath();
      ctx.arc(center, center, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = orbGradient;
      ctx.fill();

      // Glass highlight
      ctx.beginPath();
      ctx.ellipse(
        center - orbRadius * 0.15,
        center - orbRadius * 0.25,
        orbRadius * 0.5,
        orbRadius * 0.3,
        -0.3,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [audioLevel, isActive, mode, size]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className={cn(
          "transition-opacity duration-500",
          isActive ? "opacity-100" : "opacity-70"
        )}
      />
    </div>
  );
}
