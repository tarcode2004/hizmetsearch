/**
 * Convex auth configuration.
 *
 * Reads the Clerk JWT issuer domain from `CLERK_JWT_ISSUER_DOMAIN`. Set this
 * in the Convex dashboard (Settings → Environment Variables) to the value
 * shown in your Clerk dashboard under JWT Templates → "convex" → Issuer.
 *
 * If the env var isn't set yet (e.g. before Clerk is provisioned), the
 * config exports an empty providers list so Convex doesn't fail to deploy.
 * `ctx.auth.getUserIdentity()` will return `null` until a real provider is
 * configured.
 */
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: issuerDomain
    ? [
        {
          domain: issuerDomain,
          applicationID: "convex",
        },
      ]
    : [],
};
