import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { posterProps } from "@/lib/tone";
import { stripe } from "@/lib/stripe";
import { Pencil } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await requireAdmin())) notFound();
  const { data } = await createAdminClient()
    .from("series")
    .select("id, slug, title, genre, poster_url, free_episodes, is_featured, episodes(count)")
    .order("created_at", { ascending: false });
  const series = data ?? [];
  const admin = createAdminClient();
  const [{ count: episodes }, { count: subscribers }, revenue] = await Promise.all([
    admin.from("episodes").select("*", { count: "exact", head: true }),
    admin.from("subscriptions").select("*", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    monthRevenue(),
  ]);
  const money = (cents: number | null) =>
    cents === null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(cents / 100);

  return (
    <div className="wrap admin">
      <div className="head">
        <div><span className="tag">Administrador</span><h2 style={{ marginTop: 10 }}>Series</h2></div>
        <Link className="btn primary" href="/admin/serie/nueva">+ Nueva serie</Link>
      </div>
      <div className="astats">
        <div className="astat"><b>{series.length}</b><span>series publicadas</span></div>
        <div className="astat"><b>{episodes ?? 0}</b><span>episodios</span></div>
        <div className="astat"><b>{subscribers ?? 0}</b><span>suscriptores activos</span></div>
        <div className="astat"><b>{money(revenue)}</b><span>ingresos de este mes</span></div>
      </div>
      {series.length === 0 ? (
        <p className="muted">Todavía no hay series. Crea la primera.</p>
      ) : (
        <div className="alist">
          {series.map((s) => {
            const p = posterProps(s);
            const eps = (s.episodes as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Link key={s.id} href={`/admin/serie/${s.id}`} className="arow">
                <span className={`athumb ${p.className}`} style={p.style} />
                <span className="ainfo">
                  <b>{s.title}</b>
                  <small>{s.genre || "Sin género"} · {eps} episodios · {s.free_episodes} gratis{s.is_featured ? " · ★ Destacada" : ""}</small>
                </span>
                <span className="ibtn" aria-label="Editar"><Pencil /></span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Suma de lo cobrado en Stripe desde el día 1 del mes (centavos de MXN).
async function monthRevenue() {
  try {
    const now = new Date();
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    let total = 0;
    for await (const inv of stripe.invoices.list({ status: "paid", created: { gte: start }, limit: 100 })) {
      total += inv.amount_paid;
    }
    return total;
  } catch {
    return null;
  }
}
