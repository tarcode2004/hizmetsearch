import { SearchBar } from "@/components/search/SearchBar";
import { BookOpenText, MessageSquare, Sparkles, Globe } from "lucide-react";
import { useTranslation } from "@/lib/i18n/I18nProvider";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpenText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Hizmet<span className="text-primary">Search</span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            {t("home.tagline")}
          </p>
        </div>

        {/* Search bar */}
        <SearchBar large autoFocus />

        {/* Features */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={Sparkles}
            title={t("home.features.aiAnswers")}
            description={t("home.features.aiAnswersDesc")}
          />
          <FeatureCard
            icon={MessageSquare}
            title={t("home.features.chat")}
            description={t("home.features.chatDesc")}
          />
          <FeatureCard
            icon={Globe}
            title={t("home.features.multilingual")}
            description={t("home.features.multilingualDesc")}
          />
        </div>

        {/* Stats */}
        <div className="mt-8 flex justify-center gap-8 text-center text-sm text-muted-foreground">
          <div>
            <span className="block text-2xl font-bold text-foreground">980+</span>
            {t("home.stats.sources")}
          </div>
          <div>
            <span className="block text-2xl font-bold text-foreground">3</span>
            {t("home.stats.languages")}
          </div>
          <div>
            <span className="block text-2xl font-bold text-foreground">50K+</span>
            {t("home.stats.chunks")}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/30 hover:shadow-sm">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
