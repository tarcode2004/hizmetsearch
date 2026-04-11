/**
 * Build-time environment flags. Used by route components to decide whether
 * to fetch from the real Convex backend or fall back to mock fixtures.
 *
 * Set both `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` to enable
 * the live backend. Missing either keeps the app in static demo mode.
 */
export const BACKEND_ENABLED =
  !!import.meta.env.VITE_CONVEX_URL &&
  !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const CLERK_PUBLISHABLE_KEY = import.meta.env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
