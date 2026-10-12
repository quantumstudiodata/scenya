import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeries, episodeCount } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_EPISODES, hasAccesoTotal } from "@/lib/access";

export default async function SeriePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}) {
  const { slug } = await params;
  const s = await getSeries(slug);
  if (!s) notFound();

  const total = episodeCount(s);
  const current = Math.min(Math.max(Number((await searchParams).ep) || 1, 1), Math.max(total, 1));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const subscribed = await hasAccesoTotal(user?.id);
  const canWatch = current <= FREE_EPISODES || subscribed;

  // La URL del video solo sale del servidor si el episodio está permitido.
  let videoUrl: string | null = null;
  if (canWatch) {
    const { data } = await createAdminClient()
      .from("episodes")
      .select("episode_videos(video_url)")
      .eq("series_id", s.id)
      .eq("number", current)
      .maybeSingle();
    const v = data?.episode_videos as unknown as { video_url: string } | { video_url: string }[] | null;
    videoUrl = (Array.isArray(v) ? v[0]?.video_url : v?.video_url) ?? null;
  }

  const next = current < total ? current + 1 : null;

  return (
    <div className="wrap">
      <div className="player">
        <div className="screen">
          {canWatch && videoUrl ? (
            <video key={current} src={videoUrl} controls autoPlay playsInline />
          ) : canWatch ? (
            <p className="muted">Este episodio aún no tiene video.</p>
          ) : (
            <div className="locked">
              <span style={{ fontSize: 40 }}>🔒</span>
              <b>Episodio {current} bloqueado</b>
              <Link className="btn primary" href="/planes">
                Desbloquear todo
              </Link>
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <span className="tag">{s.genre}</span>
          <h1 style={{ fontSize: 32, margin: "12px 0 6px" }}>{s.title}</h1>
          <p className="muted">{s.synopsis}</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Episodio {current} de {total} · Los primeros {FREE_EPISODES} son gratis
          </p>

          <div className="eps">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
              const locked = n > FREE_EPISODES && !subscribed;
              const cls = n === current ? "cur" : locked ? "lk" : "free";
              return (
                <Link key={n} className={`ep ${cls}`} href={`/serie/${s.slug}?ep=${n}`} aria-label={`Episodio ${n}${locked ? " (bloqueado)" : ""}`}>
                  {locked ? `🔒${n}` : n}
                </Link>
              );
            })}
          </div>

          {next && (
            <div style={{ marginTop: 16 }}>
              <Link className="btn ghost" href={`/serie/${s.slug}?ep=${next}`}>Siguiente episodio →</Link>
            </div>
          )}

          {!subscribed && (
            <div className="paywall">
              <div>
                <b>Sigue viendo sin límites</b>
                <br />
                <small className="muted">Acceso Total desde $99 MXN al mes.</small>
              </div>
              <Link className="btn primary" href="/planes">Ver planes</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
