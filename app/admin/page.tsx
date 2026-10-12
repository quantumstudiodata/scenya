import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { posterProps } from "@/lib/tone";

export const dynamic = "force-dynamic";

export default async function Admin() {
  if (!(await requireAdmin())) notFound();
  const { data } = await createAdminClient()
    .from("series")
    .select("id, slug, title, genre, poster_url, free_episodes, is_featured, episodes(count)")
    .order("created_at", { ascending: false });
  const series = data ?? [];

  return (
    <div className="wrap admin">
      <div className="head">
        <div><span className="tag">Administrador</span><h2 style={{ marginTop: 10 }}>Series</h2></div>
        <Link className="btn primary" href="/admin/serie/nueva">+ Nueva serie</Link>
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
                <span className="muted">Editar →</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
