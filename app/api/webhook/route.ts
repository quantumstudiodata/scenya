import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { syncSubscription as sync } from "@/lib/subscriptions";

// Stripe avisa aquí cada alta, renovación o cancelación.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta firma" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await sync(await stripe.subscriptions.retrieve(id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await sync(event.data.object);
      break;
  }

  return NextResponse.json({ received: true });
}
