import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAccesoTotal } from "@/lib/access";
import { isAdmin } from "@/lib/admin";
import { getPriceId, stripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/subscriptions";
import { SaveGuestAccount, ChangeEmail, ChangePassword } from "./AccountForms";

export const dynamic = "force-dynamic";

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
    .select("price_id, status, current_period_end, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const yearly = sub?.price_id ? await getPriceId("anual").catch(() => null) : null;
  const plan = sub?.price_id && sub.price_id === yearly ? "Anual · $999 MXN" : "Mensual · $99 MXN";
  const until = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("es-MX", { dateStyle: "long" })
    : null;
  const guest = !!user.is_anonymous;
  const needsPassword = !!user.user_metadata?.needs_password;

  return (
    <div className="wrap account">
      <header className="acc-head">
        <span className="av big">{guest ? "I" : (user.email ?? "?")[0].toUpperCase()}</span>
        <div>
          <h1>Mi cuenta</h1>
          <p className="muted">{guest ? "Estás como invitado" : user.email}</p>
        </div>
        {isAdmin(user) && <Link className="btn soft" href="/admin">Panel de administrador</Link>}
      </header>

      {pago && (
        <p className="msg">{subscribed ? "¡Listo! Ya tienes Acceso Total. Disfruta todo el catálogo." : "Recibimos tu pago. Tu acceso se activa en unos segundos; recarga la página."}</p>
      )}

      <div className="acc-grid">
        <section className="card-sec">
          <h2>Membresía</h2>
          {subscribed ? (
            <>
              <p className="pill ok">Acceso Total activo</p>
              <dl className="kv">
                <dt>Plan</dt><dd>{plan}</dd>
                {until && <><dt>Próxima renovación</dt><dd>{until}</dd></>}
              </dl>
              <form action="/api/portal" method="POST">
                <button className="btn soft block">Administrar membresía</button>
              </form>
              <p className="muted small">Cambia de plan, actualiza tu tarjeta, descarga facturas o cancela.</p>
            </>
          ) : (
            <>
              <p className="pill">Sin membresía</p>
              <p className="muted">Puedes ver los primeros episodios de cada serie gratis.</p>
              <Link className="btn primary block" href="/planes">Obtener Acceso Total</Link>
              {sub?.stripe_customer_id && (
                <form action="/api/portal" method="POST"><button className="btn soft block">Ver facturas anteriores</button></form>
              )}
            </>
          )}
        </section>

        <section className="card-sec">
          <h2>Mis listas</h2>
          <p className="muted">Tus series guardadas y lo que dejaste a medias.</p>
          <Link className="btn soft block" href="/mi-lista">Ir a Mi lista</Link>
        </section>

        {guest ? (
          <section className="card-sec wide">
            <h2>Guarda tu cuenta</h2>
            <p className="muted">Como invitado, tu acceso vive solo en este navegador. Agrega tu correo para no perderlo y entrar desde otro dispositivo.</p>
            <SaveGuestAccount />
          </section>
        ) : (
          <>
            <section className="card-sec">
              <h2>Correo</h2>
              <dl className="kv"><dt>Correo actual</dt><dd>{user.email}</dd></dl>
              {user.new_email && <p className="msg">Pendiente de confirmar: {user.new_email}</p>}
              <ChangeEmail current={user.email ?? ""} />
            </section>
            <section className="card-sec">
              <h2>{needsPassword ? "Crea tu contraseña" : "Contraseña"}</h2>
              <ChangePassword email={user.email ?? ""} needsCurrent={!needsPassword} />
            </section>
          </>
        )}
      </div>

      <form action="/auth/salir" method="POST" style={{ marginTop: 24 }}>
        <button className="btn soft">{guest ? "Salir (perderás tu acceso de invitado)" : "Cerrar sesión"}</button>
      </form>
    </div>
  );
}
