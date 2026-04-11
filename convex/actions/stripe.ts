/**
 * Stripe integration — checkout sessions, credit packs, and customer portal.
 *
 * Required Convex env vars:
 *   STRIPE_SECRET_KEY              — sk_live_… or sk_test_…
 *   STRIPE_WEBHOOK_SECRET          — whsec_…
 *   STRIPE_PRO_PRICE_ID            — recurring price id for Pro
 *   STRIPE_SCHOLAR_PRICE_ID        — recurring price id for Scholar
 *   STRIPE_PACK_SPARK_PRICE_ID     — one-time price for Spark credit pack
 *   STRIPE_PACK_LANTERN_PRICE_ID   — one-time price for Lantern credit pack
 *   STRIPE_PACK_MINARET_PRICE_ID   — one-time price for Minaret credit pack
 */
"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import Stripe from "stripe";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // Pin to a real, current Stripe API version. Bumping this requires
  // re-testing the webhook handler against a fresh event payload.
  return new Stripe(key, { apiVersion: "2024-09-30.acacia" as any });
}

const SUBSCRIPTION_PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  scholar: process.env.STRIPE_SCHOLAR_PRICE_ID,
};

const PACK_PRICE_IDS: Record<string, string | undefined> = {
  spark: process.env.STRIPE_PACK_SPARK_PRICE_ID,
  lantern: process.env.STRIPE_PACK_LANTERN_PRICE_ID,
  minaret: process.env.STRIPE_PACK_MINARET_PRICE_ID,
};

/** Create a Stripe Checkout session for upgrading to a recurring plan. */
export const createCheckoutSession = action({
  args: {
    plan: v.union(v.literal("pro"), v.literal("scholar")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    // Explicit type annotation breaks the TS circularity that arises from
    // cross-file api references (per Convex guidelines on runQuery).
    const me: any = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error("Not authenticated");

    // Used to silently fall back to a mock URL when STRIPE_SECRET_KEY was
    // missing — that masked configuration bugs by quietly bouncing users
    // to the success page. Now we throw a real error and let the UI surface
    // it via the toast in pricing.tsx.
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "Stripe is not configured on this deployment (STRIPE_SECRET_KEY missing)."
      );
    }

    const priceId = SUBSCRIPTION_PRICE_IDS[args.plan];
    if (!priceId) {
      throw new Error(
        `Stripe price id missing for plan "${args.plan}". Set STRIPE_${args.plan.toUpperCase()}_PRICE_ID in Convex env.`
      );
    }

    const stripe = stripeClient();

    // Reuse existing Stripe customer if we know one for this user
    const existingCustomerId = me.subscription?.stripeCustomerId;
    let customerId = existingCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: me.email,
        name: me.name ?? undefined,
        metadata: { userId: me._id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        userId: me._id,
        plan: args.plan,
        kind: "subscription",
      },
      subscription_data: {
        metadata: {
          userId: me._id,
          plan: args.plan,
        },
      },
    });

    return { url: session.url ?? args.cancelUrl };
  },
});

/** Create a Stripe Checkout session for a one-time credit pack purchase. */
export const createCreditPackCheckout = action({
  args: {
    packId: v.union(
      v.literal("spark"),
      v.literal("lantern"),
      v.literal("minaret")
    ),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    // Explicit type annotation breaks the TS circularity that arises from
    // cross-file api references (per Convex guidelines on runQuery).
    const me: any = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error("Not authenticated");

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "Stripe is not configured on this deployment (STRIPE_SECRET_KEY missing)."
      );
    }

    const priceId = PACK_PRICE_IDS[args.packId];
    if (!priceId) {
      throw new Error(
        `Stripe price id missing for pack "${args.packId}". Set STRIPE_PACK_${args.packId.toUpperCase()}_PRICE_ID in Convex env.`
      );
    }

    const stripe = stripeClient();

    let customerId = me.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: me.email,
        name: me.name ?? undefined,
        metadata: { userId: me._id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      // Let users redeem promotion / 100%-off coupons on credit packs too,
      // matching the behaviour of the subscription checkout.
      allow_promotion_codes: true,
      metadata: {
        userId: me._id,
        packId: args.packId,
        kind: "credit_pack",
      },
    });

    return { url: session.url ?? args.cancelUrl };
  },
});

/** Open the Stripe Billing Portal for managing the user's subscription. */
export const createPortalSession = action({
  args: { returnUrl: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    // Explicit type annotation breaks the TS circularity that arises from
    // cross-file api references (per Convex guidelines on runQuery).
    const me: any = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error("Not authenticated");
    const customerId = me.subscription?.stripeCustomerId;
    if (!customerId) {
      throw new Error("No Stripe customer for this user");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return { url: args.returnUrl };
    }
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: args.returnUrl,
    });
    return { url: session.url ?? args.returnUrl };
  },
});
