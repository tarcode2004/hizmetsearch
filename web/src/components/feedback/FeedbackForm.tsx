import { useState } from "react";
import { Send, Check, AlertCircle, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Send a Netlify Forms submission. Forms must be pre-declared in
 * `index.html` so Netlify's build-time scanner picks them up — see
 * the hidden `<form name="feedback" ...>` block at the bottom of
 * that file. The runtime POST goes to "/" with a URL-encoded body
 * including `form-name`.
 */
async function postToNetlify(
  formName: string,
  fields: Record<string, string>,
): Promise<void> {
  const body = new URLSearchParams({ "form-name": formName, ...fields });
  const res = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Netlify form submission failed: ${res.status}`);
  }
}

interface FeedbackFormProps {
  /** Pre-fill the topic dropdown / hidden field. Useful when the
   *  form is opened from a "this didn't work" button on a specific
   *  feature. */
  initialTopic?: "bug" | "feature" | "content" | "other";
  /** Hide the wrapping card chrome — useful when embedding inside
   *  another panel like the Settings page. */
  bare?: boolean;
  /** Called after a successful submission so a parent modal can
   *  close itself or swap to a thank-you screen. */
  onSuccess?: () => void;
}

export function FeedbackForm({
  initialTopic = "bug",
  bare = false,
  onSuccess,
}: FeedbackFormProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [topic, setTopic] = useState<string>(initialTopic);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );
  const [errorText, setErrorText] = useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    setErrorText("");
    try {
      await postToNetlify("feedback", {
        name: name.trim(),
        email: email.trim(),
        topic,
        message: message.trim(),
        page: location.pathname + location.search,
        // We don't expose a stable user id on the auth state, so use
        // the email as the user identifier when present.
        user_id: email.trim() || user.email || "anonymous",
      });
      setStatus("ok");
      setMessage("");
      onSuccess?.();
      // Reset to idle after a moment so the form is reusable.
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setStatus("error");
      setErrorText(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50";

  return (
    <form
      onSubmit={submit}
      name="feedback"
      method="POST"
      data-netlify="true"
      className={cn(
        "space-y-3",
        !bare && "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]",
      )}
    >
      {/* Hidden form-name field — required by Netlify so the
          submission is matched against the static declaration in
          index.html. */}
      <input type="hidden" name="form-name" value="feedback" />

      {!bare && (
        <div>
          <h3
            className="text-sm font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Send us feedback
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Bug reports, feature ideas, or content corrections — anything
            goes. We read every submission.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Name (optional)
          </span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Email (optional, for follow-up)
          </span>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Topic
        </span>
        <select
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={inputClass}
        >
          <option value="bug">Bug — something is broken</option>
          <option value="feature">Feature request</option>
          <option value="content">Content correction or missing source</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Message
        </span>
        <textarea
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, what you expected, links to specific results — anything helpful."
          rows={5}
          required
          className={cn(inputClass, "resize-y")}
        />
      </label>

      {/* Hidden context fields — page URL and user id (if signed in)
          give us enough breadcrumbs to reproduce most reports. */}
      <input
        type="hidden"
        name="page"
        value={location.pathname + location.search}
      />
      <input
        type="hidden"
        name="user_id"
        value={email || user.email || "anonymous"}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-muted-foreground">
          {status === "ok" && (
            <span className="flex items-center gap-1 text-primary">
              <Check className="h-3 w-3" /> Thanks — we got it.
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1 text-red-500">
              <AlertCircle className="h-3 w-3" /> {errorText || "Submission failed"}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={status === "sending" || !message.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[var(--shadow-sm)]"
        >
          {status === "sending" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
