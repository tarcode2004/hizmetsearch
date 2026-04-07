import { BookOpen, Headphones, Video, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  text: BookOpen,
  audio: Headphones,
  video: Video,
  scanned: ScanLine,
};

const colorMap = {
  text: "text-primary",
  audio: "text-violet-600",
  video: "text-rose-600",
  scanned: "text-amber-600",
};

const labelMap = {
  text: "Metin",
  audio: "Ses",
  video: "Video",
  scanned: "Tarama",
};

export function SourceBadge({ sourceType }: { sourceType: string }) {
  const type = sourceType as keyof typeof iconMap;
  const Icon = iconMap[type] ?? BookOpen;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", colorMap[type] ?? "text-muted-foreground")}>
      <Icon className="h-3.5 w-3.5" />
      {labelMap[type] ?? sourceType}
    </span>
  );
}
