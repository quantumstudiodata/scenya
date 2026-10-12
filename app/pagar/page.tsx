import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAccesoTotal } from "@/lib/access";
import EmbeddedPay from "./EmbeddedPay";

const SUMMARY = {
  mensual: { name: "Acceso Total", price: "$99", period: "mes", note: "Se renueva cada mes. Cancela cuando quieras." },
  anual: { name: "Acceso Total Anual", price: "$999", period: "año", note: "Un pago al año. Ahorras $189 MXN." },
} as const;

export default async function Pagar({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: raw } = await searchParams;
  const plan = raw === "anual" ? "anual" : "mensual";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (await hasAccesoTotal(user?.id)) redirect("/cuenta");

  const s = SUMMARY[plan];
  return (
    <div className="wrap">
      <div className="pay">
        <aside>
          <Link className="muted" href="/planes">← Cambiar plan</Link>
          <span className="tag" style={{ marginTop: 20 }}>{plan === "anual" ? "Pase anual" : "Mensual"}</span>
          <h1>{s.name}</h1>
          <div className="price">{s.price}<small> MXN / {s.period}</small></div>
          <p className="muted">{s.note}</p>
          <ul>
            <li>Todo el catálogo desbloqueado</li>
            <li>Estrenos nuevos cada semana</li>
            <li>Sin monedas ni recompensas</li>
          </ul>
          <p className="muted" style={{ fontSize: 13 }}>Pago seguro con Stripe. Puedes pagar con tarjeta, Apple Pay o Google Pay.</p>
        </aside>
        <EmbeddedPay plan={plan} />
      </div>
    </div>
  );
}
