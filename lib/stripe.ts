import "server-only";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const PLANS = {
  mensual: { priceId: process.env.STRIPE_PRICE_MONTHLY!, label: "Acceso Total", price: 99, period: "mes" },
  anual: { priceId: process.env.STRIPE_PRICE_YEARLY!, label: "Acceso Total Anual", price: 999, period: "año" },
} as const;

export type PlanKey = keyof typeof PLANS;
