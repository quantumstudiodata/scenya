import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAccesoTotal } from "@/lib/access";

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/cuenta");

  const { pago } = await searchParams;
  const subscribed = await hasAccesoTotal(user.id);
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("price_id, current_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const plan = sub?.price_id === process.env.STRIPE_PRICE_YEARLY ? "Anual ($999 MXN)" : "Mensual ($99 MXN)";
  const until = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("es-MX", { dateStyle: "long" })
    : null;

  return (
    <div className="wrap">
      <div className="panel">
        <h1>Mi cuenta</h1>
        {pago === "ok" && !subscribed && (
          <p className="msg">Recibimos tu pago. Tu acceso se activa en unos segundos; recarga la página.</p>
        )}
        <p className="muted">{user.email}</p>
        {subscribed ? (
          <>
            <p className="msg">Acceso Total activo · {plan}{until ? ` · Renueva el ${until}` : ""}</p>
            <form action="/api/portal" method="POST">
              <button className="btn ghost block">Administrar o cancelar suscripción</button>
            </form>
          </>
        ) : (
          <>
            <p>No tienes Acceso Total. Puedes ver los primeros episodios de cada serie gratis.</p>
            <Link className="btn primary block" href="/planes">Ver planes</Link>
          </>
        )}
        <form action="/auth/salir" method="POST">
          <button className="btn ghost block">Cerrar sesión</button>
        </form>
      </div>
    </div>
  );
}
