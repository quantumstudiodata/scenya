import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/subscriptions";
import { hasAccesoTotal } from "@/lib/access";

// Al terminar el pago dentro de la ventana, activa el acceso sin esperar al webhook.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (sessionId?.startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id === user.id && session.subscription) {
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(await stripe.subscriptions.retrieve(id), user.id);
    }
  }
  return NextResponse.json({ subscribed: await hasAccesoTotal(user.id) });
}
