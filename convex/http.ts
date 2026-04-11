/**
 * HTTP entry points (Convex `httpAction`s).
 *
 * Currently exposes:
 *   POST /stripe/webhook  — Stripe webhook receiver
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   URL:    https://<your-deployment>.convex.site/stripe/webhook
 *   Events: checkout.session.completed,
 *           customer.subscription.created,
 *           customer.subscription.updated,
 *           customer.subscription.deleted,
 *           invoice.payment_succeeded,
 *           invoice.payment_failed
 */
// http.ts must run in Convex's default V8 runtime, NOT Node — `httpAction`
// is not supported in the Node runtime. Stripe's SDK has a Web-compatible
// build (with `constructEventAsync` using Web Crypto) so this works fine.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

const http = httpRouter();

/**
 * Read `current_period_end` from a Stripe Subscription regardless of API
 * version. In Stripe API ≥ 2024-12 the field moved from the top level of
 * Subscription to `items.data[0].current_period_end`. We try both so the
 * webhook handler keeps working across SDK + API upgrades.
 */
function currentPeriodEndMs(sub: Stripe.Subscription): number {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof top === "number") return top * 1000;
  const fromItem = (
    sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined
  )?.current_period_end;
  if (typeof fromItem === "number") return fromItem * 1000;
  // Fallback: a month from now (conservative — webhook will re-fire on renewal)
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!secret || !stripeKey) {
      return new Response("Stripe not configured", { status: 503 });
    }

    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const body = await request.text();
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-09-30.acacia" as any,
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, secret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(`Invalid signature: ${err}`, { status: 400 });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const kind = session.metadata?.kind;
          const userId = session.metadata?.userId;
          if (!userId) break;

          if (kind === "credit_pack") {
            const packId = session.metadata?.packId;
            if (packId) {
              await ctx.runMutation(internal.billing.applyCreditPack, {
                userId: userId as any,
                packId,
                stripeCustomerId: session.customer as string,
              });
            }
          } else if (kind === "subscription") {
            const plan = session.metadata?.plan as "pro" | "scholar" | undefined;
            const subscriptionId = session.subscription as string | null;
            if (plan && subscriptionId) {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              await ctx.runMutation(internal.billing.syncSubscription, {
                userId: userId as any,
                plan,
                stripeCustomerId: sub.customer as string,
                stripeSubscriptionId: sub.id,
                status: sub.status,
                currentPeriodEnd: currentPeriodEndMs(sub),
              });
            }
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          const plan = sub.metadata?.plan as "pro" | "scholar" | undefined;
          if (userId && plan) {
            await ctx.runMutation(internal.billing.syncSubscription, {
              userId: userId as any,
              plan,
              stripeCustomerId: sub.customer as string,
              stripeSubscriptionId: sub.id,
              status: sub.status,
              currentPeriodEnd: currentPeriodEndMs(sub),
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await ctx.runMutation(internal.billing.cancelByStripeSubscription, {
            stripeSubscriptionId: sub.id,
          });
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subId =
            typeof invoice.subscription === "string"
              ? invoice.subscription
              : invoice.subscription?.id;
          if (subId) {
            await ctx.runMutation(internal.billing.markPastDue, {
              stripeSubscriptionId: subId,
            });
          }
          break;
        }

        default:
          // Ignore other events
          break;
      }
    } catch (err) {
      console.error("Webhook handler error:", err);
      return new Response("Internal error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  }),
});

export default http;
