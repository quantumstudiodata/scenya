import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAccesoTotal } from "@/lib/access";
import { getPriceId, stripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/subscriptions";
import { SaveGuestAccount, SetPassword } from "./AccountForms";

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/cuenta");

  const { pago } = await searchParams;
  // Al volver del pago, activa el acceso de inmediato sin esperar al webhook.
  if (pago?.startsWith("cs_")) {
    try {
      const session = await stripe.checkout.sessions.retrieve(pago);
      if (session.client_reference_id === user.id && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe.subscriptions.retrieve(id), user.id);
      }
    } catch (err) {
      console.error("cuenta: no se pudo sincronizar el pago", err);
    }
  }
  const subscribed = await hasAccesoTotal(user.id);
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("price_id, current_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const yearly = subscribed ? await getPriceId("anual").catch(() => null) : null;
  const plan = sub?.price_id && sub.price_id === yearly ? "Anual ($999 MXN)" : "Mensual ($99 MXN)";
  const until = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("es-MX", { dateStyle: "long" })
    : null;

  return (
    <div className="wrap">
      <div className="panel">
        <h1>Mi cuenta</h1>
        {pago && subscribed && (
          <p className="msg">¡Listo! Ya tienes Acceso Total. Disfruta todo el catálogo.</p>
        )}
        {pago && !subscribed && (
          <p className="msg">Recibimos tu pago. Tu acceso se activa en unos segundos; recarga la página.</p>
        )}
        <p className="muted">{user.is_anonymous ? "Estás como invitado" : user.email}</p>
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
        {user.is_anonymous ? (
          <>
            <h2 style={{ fontSize: 20, marginTop: 8 }}>Guarda tu cuenta</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Como invitado, tu acceso vive solo en este navegador. Agrega tu correo para no perderlo
              y poder entrar desde otro dispositivo.
            </p>
            <SaveGuestAccount />
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, marginTop: 8 }}>Contraseña</h2>
            <SetPassword />
          </>
        )}
        <form action="/auth/salir" method="POST">
          <button className="btn ghost block">
            {user.is_anonymous ? "Salir (perderás tu acceso de invitado)" : "Cerrar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
