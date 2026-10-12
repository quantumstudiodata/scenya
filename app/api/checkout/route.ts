import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, PLANS, getPriceId, type PlanKey } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });

  const { plan } = (await request.json().catch(() => ({}))) as { plan?: PlanKey };
  if (!plan || !(plan in PLANS)) return NextResponse.json({ error: "Plan no válido." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Invitados sin correo: Stripe pide el correo en el pago y crea el cliente;
  // el webhook lo liga al usuario con subscription_data.metadata.
  let customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId && user.email) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: customerId });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(customerId ? { customer: customerId } : {}),
      client_reference_id: user.id,
      line_items: [{ price: await getPriceId(plan), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      locale: "es",
      success_url: `${site}/cuenta?pago=ok`,
      cancel_url: `${site}/planes`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout", err);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intenta de nuevo." }, { status: 500 });
  }
}
