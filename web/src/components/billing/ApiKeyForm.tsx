import { useState } from "react";
import { Eye, EyeOff, Key, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ApiKeyFormProps {
  geminiKeySet: boolean;
  claudeKeySet: boolean;
  byokActive: boolean;
  onSaveGemini: (key: string) => void;
  onSaveClaude: (key: string) => void;
  onRemoveGemini: () => void;
  onRemoveClaude: () => void;
  onToggleByok: (active: boolean) => void;
}

export function ApiKeyForm({
  geminiKeySet,
  claudeKeySet,
  byokActive,
  onSaveGemini,
  onSaveClaude,
  onRemoveGemini,
  onRemoveClaude,
  onToggleByok,
}: ApiKeyFormProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* BYOK Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            {t("byok.toggle.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("byok.toggle.desc")}
          </p>
        </div>
        <button
          onClick={() => onToggleByok(!byokActive)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            byokActive ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
              byokActive ? "translate-x-5.5" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* Key inputs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KeyInput
          label={t("byok.geminiKey")}
          isSet={geminiKeySet}
          placeholder="AIza..."
          helpUrl="https://aistudio.google.com/apikey"
          onSave={onSaveGemini}
          onRemove={onRemoveGemini}
          color="blue"
        />
        <KeyInput
          label={t("byok.claudeKey")}
          isSet={claudeKeySet}
          placeholder="sk-ant-..."
          helpUrl="https://console.anthropic.com/settings/keys"
          onSave={onSaveClaude}
          onRemove={onRemoveClaude}
          color="amber"
        />
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-foreground/70 leading-relaxed">
          <strong className="text-foreground">{t("byok.privacy.label")}</strong>{" "}
          {t("byok.privacy.desc")}
        </p>
      </div>
    </div>
  );
}

function KeyInput({
  label,
  isSet,
  placeholder,
  helpUrl,
  onSave,
  onRemove,
  color,
}: {
  label: string;
  isSet: boolean;
  placeholder: string;
  helpUrl: string;
  onSave: (key: string) => void;
  onRemove: () => void;
  color: "blue" | "amber";
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const handleSave = () => {
    if (!value.trim()) return;
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      const valid = value.length > 8;
      setTestResult(valid ? "success" : "error");
      if (valid) {
        onSave(value.trim());
        setValue("");
      }
    }, 1000);
  };

  const borderColor = color === "blue" ? "border-blue-200 dark:border-blue-900" : "border-amber-200 dark:border-amber-900";
  const bgColor = color === "blue" ? "bg-blue-50 dark:bg-blue-950/40" : "bg-amber-50 dark:bg-amber-950/40";
  const textColor = color === "blue" ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300";

  return (
    <div className={cn("rounded-xl border p-4", isSet ? borderColor : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {isSet && (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", bgColor, textColor)}>
            <CheckCircle2 className="h-3 w-3" /> {t("byok.active")}
          </span>
        )}
      </div>

      {isSet ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-mono">
            {"•".repeat(12)}...{"•".repeat(4)}
          </span>
          <button
            onClick={onRemove}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> {t("byok.remove")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={visible ? "text" : "password"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setTestResult(null);
              }}
              placeholder={placeholder}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-9 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={() => setVisible(!visible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {testResult === "error" && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3 w-3" /> {t("byok.invalid")}
            </p>
          )}

          <div className="flex items-center justify-between">
            <a
              href={helpUrl}
              target="_blank"
              rel="noopener"
              className="text-[11px] text-primary hover:underline"
            >
              {t("byok.howToGet")}
            </a>
            <button
              onClick={handleSave}
              disabled={!value.trim() || testing}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
              {testing ? t("byok.testing") : t("byok.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
