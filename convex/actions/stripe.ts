/**
 * Stripe integration — checkout sessions and portal.
 *
 * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Convex env vars.
 * Price IDs should be set as STRIPE_PRO_PRICE_ID and STRIPE_SCHOLAR_PRICE_ID.
 */
import { action } from "../_generated/server";
import { v } from "convex/values";

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_placeholder",
  scholar: process.env.STRIPE_SCHOLAR_PRICE_ID ?? "price_scholar_placeholder",
};

/** Create a Stripe Checkout session for upgrading. */
export const createCheckoutSession = action({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("pro"), v.literal("scholar")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      // Dev mode: return mock URL
      return { url: `${args.successUrl}?session_id=mock_session_${args.plan}` };
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": PRICE_IDS[args.plan],
        "line_items[0][quantity]": "1",
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        "metadata[userId]": args.userId,
        "metadata[plan]": args.plan,
      }),
    });

    const session = await response.json();
    return { url: session.url ?? args.cancelUrl };
  },
});

/** Create a Stripe Customer Portal session for managing subscription. */
export const createPortalSession = action({
  args: {
    stripeCustomerId: v.string(),
    returnUrl: v.string(),
  },
  handler: async (_ctx, args) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { url: args.returnUrl };
    }

    const response = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: args.stripeCustomerId,
          return_url: args.returnUrl,
        }),
      }
    );

    const session = await response.json();
    return { url: session.url ?? args.returnUrl };
  },
});
