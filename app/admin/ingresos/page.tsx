import Link from "next/link";
import { notFound } from "next/navigation";
import type Stripe from "stripe";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, PLANS } from "@/lib/stripe";
import PaymentsTable, { type Payment } from "./PaymentsTable";

export const dynamic = "force-dynamic";

const PERIODS = { mes: "Este mes", "30": "Últimos 30 días", "90": "Últimos 90 días", todo: "Todo" } as const;
type Period = keyof typeof PERIODS;

const REASON: Record<string, string> = {
  subscription_create: "Nueva suscripción",
  subscription_cycle: "Renovación",
  subscription_update: "Cambio de plan",
};

export default async function Ingresos({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  if (!(await requireAdmin())) notFound();
  const { periodo } = await searchParams;
  const period: Period = periodo && periodo in PERIODS ? (periodo as Period) : "mes";

  const now = new Date();
  const since =
    period === "mes" ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === "todo" ? null
    : new Date(now.getTime() - Number(period) * 86400000);

  let payments: Payment[] = [];
  let error = "";
  try {
    const invoices: Stripe.Invoice[] = [];
    const params: Stripe.InvoiceListParams = { status: "paid", limit: 100, ...(since ? { created: { gte: Math.floor(since.getTime() / 1000) } } : {}) };
    for await (const inv of stripe.invoices.list(params)) {
      if (inv.amount_paid > 0) invoices.push(inv);
      if (invoices.length >= 1000) break;
    }

    // Estado actual de cada cliente según nuestra tabla de suscripciones.
    const customers = [...new Set(invoices.map((i) => (typeof i.customer === "string" ? i.customer : i.customer?.id)).filter(Boolean))] as string[];
    const { data: subs } = customers.length
      ? await createAdminClient().from("subscriptions").select("stripe_customer_id, status, current_period_end").in("stripe_customer_id", customers)
      : { data: [] };
    const subBy = new Map((subs ?? []).map((s) => [s.stripe_customer_id, s]));

    payments = invoices.map((inv) => {
      const customerId = (typeof inv.customer === "string" ? inv.customer : inv.customer?.id) ?? "";
      const product = inv.lines.data[0]?.pricing?.price_details?.product;
      const plan = product === PLANS.anual.productId ? "Anual" : product === PLANS.mensual.productId ? "Mensual" : "—";
      const sub = subBy.get(customerId);
      return {
        id: inv.id ?? "",
        date: new Date(inv.created * 1000).toISOString(),
        name: inv.customer_name ?? "",
        email: inv.customer_email ?? "",
        plan,
        amount: inv.amount_paid,
        currency: inv.currency,
        reason: REASON[inv.billing_reason ?? ""] ?? "Pago",
        status: sub?.status ?? "",
        renews: sub?.current_period_end ?? null,
        receipt: inv.hosted_invoice_url ?? null,
        stripeUrl: `https://dashboard.stripe.com/${inv.livemode ? "" : "test/"}customers/${customerId}`,
      };
    });
  } catch {
    error = "No se pudieron leer los pagos de Stripe. Revisa la clave STRIPE_SECRET_KEY.";
  }

  return (
    <div className="wrap admin">
      <Link className="muted" href="/admin">← Panel</Link>
      <div className="head">
        <h2 style={{ marginTop: 10 }}>Ingresos</h2>
        <nav className="chips" aria-label="Periodo">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={`/admin/ingresos?periodo=${p}`} className={`chip${p === period ? " on" : ""}`}>{PERIODS[p]}</Link>
          ))}
        </nav>
      </div>
      {error ? <p className="msg err">{error}</p> : <PaymentsTable payments={payments} />}
    </div>
  );
}
