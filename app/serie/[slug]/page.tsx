import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeries, getReviews, seriesLikes, listSeries, episodeCount, compact } from "@/lib/catalog";
import { posterProps } from "@/lib/tone";
import { FREE_EPISODES } from "@/lib/access";
import SeriesCard from "@/components/SeriesCard";
import ShareButton from "@/components/ShareButton";
import { Play } from "@/components/Icons";
import SeriesTabs from "./SeriesTabs";
import ReviewForm from "./ReviewForm";

const stars = (n: number) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));
const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2) + name.slice(-1);

export default async function SeriePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getSeries(slug);
  if (!s) notFound();

  const [{ reviews, avg }, likes, all] = await Promise.all([getReviews(s.id), seriesLikes(s.id), listSeries()]);
  const recs = [...all.filter((x) => x.id !== s.id && x.genre === s.genre), ...all.filter((x) => x.id !== s.id && x.genre !== s.genre)].slice(0, 6);
  const p = posterProps(s);
  const total = episodeCount(s);

  return (
    <>
      <header className="sh">
        <div className={`bg ${p.className}`} style={p.style} />
        <div className="wrap">
          <Link href={`/ver/${s.slug}`} className={`cover ${p.className}`} style={p.style} aria-label={`Ver ${s.title}`}>
            <span className="play"><Play /></span>
          </Link>
          <div>
            <span className="chip">{s.genre} · {total} episodios{avg ? ` · ★ ${avg.toFixed(1)}` : ""}</span>
            <h1>{s.title}</h1>
            <div className="facts">
              <div><b>{total}</b>episodios</div>
              <div><b>{FREE_EPISODES}</b>gratis</div>
              <div><b>{avg ? `★ ${avg.toFixed(1)}` : "—"}</b>{reviews.length} reseñas</div>
              <div><b>{compact(likes)}</b>me gusta</div>
            </div>
            <div className="acts">
              <Link className="btn primary" href={`/ver/${s.slug}`} style={{ padding: "12px 30px" }}><Play />Ver ahora</Link>
              <ShareButton title={s.title} path={`/serie/${s.slug}`} />
            </div>
          </div>
        </div>
      </header>

      <div className="wrap">
        <SeriesTabs reviews={reviews.length}>
          <div data-pane="sinopsis resenas" data-on="true">
            <div data-pane="sinopsis" data-on="true">
              <h2 className="pane-title">Sinopsis</h2>
              <p className="synopsis" style={{ marginTop: 4 }}>{s.synopsis}</p>
            </div>
            <div data-pane="resenas">
              <h2>Reseñas de invitados</h2>
              <ReviewForm seriesId={s.id} slug={s.slug} />
              {reviews.length ? (
                <div className="reviews">
                  {reviews.map((r) => (
                    <div className="review" key={r.id}>
                      <header>
                        <span className="who"><span className="av">{initials(r.author_name)}</span>{r.author_name}</span>
                        <span className="stars">{stars(r.rating)}</span>
                      </header>
                      <p>{r.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Sé la primera persona en dejar una reseña.</p>
              )}
            </div>
          </div>
          <div data-pane="similares">
            <h2 className="pane-title">Otras recomendaciones</h2>
            <div className="recs">
              {recs.map((r) => <SeriesCard key={r.id} s={r} />)}
            </div>
          </div>
        </SeriesTabs>
      </div>
    </>
  );
}
