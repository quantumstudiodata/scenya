import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, getPriceId } from "@/lib/stripe";
import { syncSubscription } from "@/lib/subscriptions";

// Cancelar, reactivar o pasar a anual sin salir de Scenya.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { action } = (await request.json().catch(() => ({}))) as { action?: "cancel" | "resume" | "annual" };
  const { data: row } = await createAdminClient()
    .from("subscriptions").select("stripe_subscription_id").eq("user_id", user.id).maybeSingle();
  if (!row?.stripe_subscription_id) return NextResponse.json({ error: "No tienes una membresía activa." }, { status: 400 });

  try {
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    let updated = sub;
    if (action === "cancel") {
      updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    } else if (action === "resume") {
      updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    } else if (action === "annual") {
      const annual = await getPriceId("anual");
      const item = sub.items.data[0];
      if (item.price.id === annual) return NextResponse.json({ error: "Ya tienes el plan anual." }, { status: 400 });
      // Se cobra hoy la diferencia proporcional y el plan anual empieza de inmediato.
      updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
        items: [{ id: item.id, price: annual }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });
    } else {
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
    }
    await syncSubscription(updated, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("subscription", err);
    const msg = (err as { code?: string }).code === "card_declined"
      ? "Tu tarjeta fue rechazada. Actualiza tu método de pago e intenta de nuevo."
      : "No se pudo completar el cambio. Intenta de nuevo.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
