import { useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Link as LinkIcon,
  Check,
  BookOpenText,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { BismillahMark } from "@/components/ornaments/BismillahMark";

interface ViewerHeaderProps {
  title: string;
  author?: string | null;
  collection?: string | null;
  section?: string | null;
  language?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  /** Decoded path segments from the R2 URL — rendered as a folder
   *  breadcrumb so users can see the original folder context (e.g.
   *  "Audio › Bediüzzaman Konferansları › 2018 › HKEOMIX2834.flv"). */
  pathTrail?: string[];
}

/**
 * Sticky header for the source viewer.
 *
 * Contains:
 * - Back-to-app arrow + logo mark
 * - Breadcrumb: Home › Search › Title › Section
 * - Title in Fraunces display serif
 * - Language + source-type badges
 * - Action buttons: copy link, open in new tab, download
 */
export function ViewerHeader({
  title,
  author,
  collection,
  section,
  language,
  sourceType,
  sourceUrl,
  pathTrail,
}: ViewerHeaderProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked in iframes */
    }
  };

  const showBismillah = collection === "Risale-i Nur";

  return (
    <header className="relative border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex w-full items-center gap-3 px-4 py-3">
        {/* Left: back arrow + logo */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground no-underline transition-colors"
          title={t("viewer.backToSearch")}
        >
          <ArrowLeft className="h-4 w-4" />
          <BookOpenText className="hidden h-4 w-4 sm:block" />
        </Link>

        <div className="h-5 w-px bg-border hidden sm:block" />

        {/* Title block */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb. We render the original R2 folder trail (when
              available) so users can see what bucket / series / year a
              file belongs to — critical for audio chunks where the
              filename alone (e.g. "HKEOMIX2834.flv") is meaningless.
              The trail's last segment is the filename itself, which we
              drop in favor of the parsed `title`. */}
          <nav className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
            <Link to="/" className="no-underline hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight className="h-2.5 w-2.5 opacity-50" />
            <Link
              to="/search"
              className="no-underline hover:text-foreground transition-colors"
            >
              Search
            </Link>
            <ChevronRight className="h-2.5 w-2.5 opacity-50" />
            {pathTrail && pathTrail.length > 1
              ? pathTrail.slice(0, -1).map((seg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="truncate max-w-[140px]" title={seg}>
                      {seg}
                    </span>
                    <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                  </span>
                ))
              : collection && (
                  <>
                    <span className="truncate max-w-[80px] sm:max-w-none">
                      {collection}
                    </span>
                    <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                  </>
                )}
            <span className="text-foreground/80 truncate" title={title}>
              {title}
            </span>
          </nav>

          {/* Title row */}
          <div className="flex items-center gap-2">
            {showBismillah && <BismillahMark size={14} />}
            <h1
              className="truncate text-foreground"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.0625rem",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                fontOpticalSizing: "auto",
              }}
            >
              {title}
            </h1>
            {language && <LanguageBadge language={language} />}
            {sourceType && <SourceBadge sourceType={sourceType} />}
          </div>

          {/* Metadata row. We always render a speaker line so users
              don't see a blank — falls back to "Speaker unknown" for
              audio chunks where the chunker couldn't extract a name. */}
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="truncate"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              {author || (sourceType === "audio" ? "Speaker unknown" : "—")}
            </span>
            {section && (
              <>
                <span>·</span>
                <span className="hidden truncate sm:inline">{section}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip content={copied ? t("viewer.linkCopied") : t("viewer.copyLink")} side="bottom">
            <button
              onClick={copyLink}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                copied
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-label="Copy link"
            >
              {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            </button>
          </Tooltip>

          {sourceUrl && (
            <>
              <Tooltip content={t("viewer.openInNewTab")} side="bottom">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Tooltip>
              <a
                href={sourceUrl}
                download
                className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[var(--shadow-sm)]"
                aria-label={t("viewer.downloadOriginal")}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("viewer.downloadOriginal")}</span>
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
