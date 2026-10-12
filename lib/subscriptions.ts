import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "./supabase/admin";

// Copia el estado de una suscripción de Stripe a la tabla subscriptions.
export async function syncSubscription(sub: Stripe.Subscription, fallbackUserId?: string) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId = sub.metadata?.user_id || fallbackUserId;
  if (!userId) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) {
    console.error("suscripción sin usuario", sub.id);
    return;
  }

  // En versiones recientes de la API el periodo vive en cada item.
  const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;

  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    price_id: item?.price.id ?? null,
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
