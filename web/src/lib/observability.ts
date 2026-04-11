/**
 * Sentry initialization for the web app.
 *
 * Reads `VITE_SENTRY_DSN` at build time. If unset (dev / demo mode), the
 * SDK is left uninitialized and `captureError` becomes a no-op so the app
 * still runs without an account.
 */
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const environment =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
  (import.meta.env.MODE === "production" ? "production" : "development");

let initialized = false;

export function initObservability() {
  if (initialized || !dsn) return;
  Sentry.init({
    dsn,
    environment,
    // Conservative defaults — turn up via env vars in production if needed.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
    // Don't ship local console errors.
    beforeSend(event) {
      if (environment === "development") return null;
      return event;
    },
  });
  initialized = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function setUserContext(user: {
  id?: string;
  email?: string;
  name?: string;
}) {
  if (!initialized) return;
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });
}

export function clearUserContext() {
  if (!initialized) return;
  Sentry.setUser(null);
}
