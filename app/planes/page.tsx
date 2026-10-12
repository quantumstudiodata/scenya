import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasAccesoTotal } from "@/lib/access";

export default async function Planes() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const subscribed = await hasAccesoTotal(user?.id);

  return (
    <div className="wrap">
      <section>
        <div className="head" style={{ justifyContent: "center", textAlign: "center" }}>
          <h2 style={{ fontSize: 32 }}>Un plan. Todo el catálogo.</h2>
        </div>

        {subscribed ? (
          <div className="panel" style={{ textAlign: "center" }}>
            <h1>Ya tienes Acceso Total</h1>
            <p className="muted">Todo el catálogo está desbloqueado.</p>
            <Link className="btn primary" href="/cuenta">Administrar suscripción</Link>
          </div>
        ) : (
          <div className="plans">
            <div className="plan"><div>
              <span className="tag">Mensual</span>
              <h3>Acceso Total</h3>
              <div className="price">$99<small> MXN / mes</small></div>
              <ul>
                <li>Todo el catálogo desbloqueado</li>
                <li>Estrenos nuevos cada semana</li>
                <li>Sin monedas ni recompensas</li>
                <li>Cancela cuando quieras</li>
              </ul>
              <Link className="btn primary block" href="/pagar?plan=mensual">Suscribirme</Link>
            </div></div>
            <div className="plan"><div>
              <span className="tag">Pase anual</span>
              <h3>Acceso Total Anual</h3>
              <div className="price">$999<small> MXN / año</small></div>
              <ul>
                <li>Todo lo del plan mensual</li>
                <li>Ahorras $189 MXN (casi 2 meses gratis)</li>
                <li>Un solo pago al año</li>
                <li>Cancela cuando quieras</li>
              </ul>
              <Link className="btn primary block" href="/pagar?plan=anual">Obtener pase anual</Link>
            </div></div>
          </div>
        )}
        <p className="note">Pago seguro con Stripe · Primeros episodios gratis en cada serie</p>
      </section>
    </div>
  );
}
