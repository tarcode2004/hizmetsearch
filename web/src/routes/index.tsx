import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { SearchBar } from "@/components/search/SearchBar";
import {
  BookOpenText,
  MessageSquare,
  Sparkles,
  Globe,
  ArrowUpRight,
  Search as SearchIcon,
  Coffee,
} from "lucide-react";
import { OrnamentDivider } from "@/components/ornaments/OrnamentDivider";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { detectArabicScript, cn } from "@/lib/utils";
import { fadeInUp, staggerParent } from "@/lib/motion";

const ROTATING_QUERIES = [
  "İman hakikatleri nelerdir?",
  "What is the First Word about?",
  "ما هو التوكل؟",
  "Risale-i Nur'da kader bahsi",
  "How does Bediüzzaman define prayer?",
  "Hizmet hareketinde diyalog",
];

export function HomePage() {
  const { t } = useTranslation();
  const [rotIdx, setRotIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setRotIdx((i) => (i + 1) % ROTATING_QUERIES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const currentQuery = ROTATING_QUERIES[rotIdx];
  const queryIsArabic = detectArabicScript(currentQuery);

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-16 pt-10 sm:pt-24">
      <div className="w-full max-w-3xl">
        {/* ─── Hero ─── */}
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="show"
          className="mb-10 text-center"
        >
          <motion.div variants={fadeInUp} className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-[var(--shadow-md)]">
            <BookOpenText className="h-7 w-7 text-primary-foreground" />
          </motion.div>

          <motion.h1
            variants={fadeInUp}
            className="text-display-1 text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Hizmet
            <span className="text-primary">Search</span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-[44ch] text-body-lg text-muted-foreground"
          >
            {t("home.tagline")}
          </motion.p>
        </motion.div>

        {/* ─── Search bar ─── */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl"
        >
          <SearchBar large autoFocus />
        </motion.div>

        {/* ─── Rotating query hint ─── */}
        <div className="mt-4 flex min-h-[24px] items-center justify-center">
          <motion.div
            key={rotIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <SearchIcon className="h-3 w-3 opacity-50" />
            <span className="opacity-70">People are asking:</span>
            <span
              className={cn(
                "text-foreground/80",
                queryIsArabic && "font-[var(--font-arabic)] text-sm"
              )}
              style={{
                fontFamily: queryIsArabic ? undefined : "var(--font-display)",
                fontStyle: queryIsArabic ? undefined : "italic",
              }}
              dir={queryIsArabic ? "rtl" : "ltr"}
            >
              "{currentQuery}"
            </span>
          </motion.div>
        </div>

        <OrnamentDivider className="my-16" />

        {/* ─── Bento features grid ─── */}
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-6"
        >
          {/* Primary feature: AI Answers — spans 4 cols */}
          <BentoCard
            className="sm:col-span-4"
            size="lg"
            icon={Sparkles}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            title={t("home.features.aiAnswers")}
            description={t("home.features.aiAnswersDesc")}
          />

          {/* Chat Mode — 2 cols */}
          <BentoCard
            className="sm:col-span-2"
            size="sm"
            icon={MessageSquare}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-600 dark:text-blue-400"
            title={t("home.features.chat")}
            description={t("home.features.chatDesc")}
          />

          {/* Multilingual — 3 cols */}
          <BentoCard
            className="sm:col-span-3"
            size="sm"
            icon={Globe}
            iconBg="bg-accent/10"
            iconColor="text-accent"
            title={t("home.features.multilingual")}
            description={t("home.features.multilingualDesc")}
          />

          {/* Passage citations — 3 cols */}
          <BentoCard
            className="sm:col-span-3"
            size="sm"
            icon={BookOpenText}
            iconBg="bg-amber-500/10"
            iconColor="text-amber-600 dark:text-amber-400"
            title="Verifiable citations"
            description="Every claim links to the exact page or timestamp"
          />
        </motion.div>

        <OrnamentDivider className="my-16" />

        {/* ─── Stats ─── */}
        <div className="flex flex-wrap justify-center gap-8 text-center sm:gap-16">
          <Stat value={980} suffix="+" label={t("home.stats.sources")} />
          <Stat value={3} label={t("home.stats.languages")} />
          <Stat value={50} suffix="K+" label={t("home.stats.chunks")} />
        </div>

        {/* ─── Support the Project ─── */}
        <div className="mt-20">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/60 px-6 py-8 text-center sm:px-10 sm:py-10">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Coffee className="h-5 w-5 text-primary" />
            </div>
            <h3
              className="text-h2-serif text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Support the Project
            </h3>
            <p className="mx-auto mt-3 max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
              HizmetSearch is a community-supported project. If you find it
              valuable, consider buying us a coffee — it directly funds
              ingestion, hosting, and the API costs that keep the corpus alive.
            </p>
            <a
              href="https://buymeacoffee.com/tarmus1291i?new=1"
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline transition-all hover:bg-primary/90 shadow-[var(--shadow-sm)]"
            >
              <Coffee className="h-4 w-4" />
              Buy Me a Coffee
              <ArrowUpRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bento card ──────────────────────────────────────────────

function BentoCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  size,
  className,
}: {
  icon: typeof Sparkles;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  size: "sm" | "lg";
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all",
        "hover:border-primary/30 hover:shadow-[var(--shadow-md)]",
        size === "lg" && "sm:p-7",
        className
      )}
    >
      <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl", iconBg, size === "lg" && "h-12 w-12")}>
        <Icon className={cn("h-5 w-5", iconColor, size === "lg" && "h-6 w-6")} />
      </div>
      <h3
        className={cn(
          "text-foreground",
          size === "lg" ? "text-h2-serif" : "text-base font-semibold"
        )}
        style={size === "lg" ? { fontFamily: "var(--font-display)" } : undefined}
      >
        {title}
      </h3>
      <p className={cn("mt-1 text-muted-foreground", size === "lg" ? "text-base" : "text-sm")}>
        {description}
      </p>
      <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.div>
  );
}

// ── Animated counter ────────────────────────────────────────

function Stat({
  value,
  suffix = "",
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const display = useSpring(rounded, { stiffness: 80, damping: 25 });
  const [rendered, setRendered] = useState(0);

  useEffect(() => {
    if (inView) {
      count.set(value);
    }
  }, [inView, count, value]);

  useEffect(() => {
    return display.on("change", (v) => setRendered(Math.round(v)));
  }, [display]);

  return (
    <div ref={ref}>
      <div
        className="text-h1-serif text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {rendered}
        {suffix}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
