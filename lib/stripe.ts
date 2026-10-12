import "server-only";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Cada plan es un producto de Stripe; se cobra su precio predeterminado.
export const PLANS = {
  mensual: { productId: process.env.STRIPE_PRODUCT_MONTHLY! },
  anual: { productId: process.env.STRIPE_PRODUCT_YEARLY! },
} as const;

export type PlanKey = keyof typeof PLANS;

export async function getPriceId(plan: PlanKey) {
  const product = await stripe.products.retrieve(PLANS[plan].productId);
  const price = product.default_price;
  if (!price) throw new Error(`El producto ${product.id} no tiene precio predeterminado`);
  return typeof price === "string" ? price : price.id;
}
