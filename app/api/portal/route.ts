import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/entrar?next=/cuenta", request.url), { status: 303 });

  const { data } = await createAdminClient()
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.stripe_customer_id) return NextResponse.redirect(new URL("/planes", request.url), { status: 303 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${site}/cuenta`,
  });
  return NextResponse.redirect(portal.url, { status: 303 });
}
