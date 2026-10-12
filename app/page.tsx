import Link from "next/link";
import CineHero from "@/components/CineHero";
import ContinueWatching from "@/components/ContinueWatching";
import SeriesCard from "@/components/SeriesCard";
import { listSeries, episodeCount } from "@/lib/catalog";
import { posterProps } from "@/lib/tone";
import { FREE_EPISODES } from "@/lib/access";

export default async function Home() {
  const series = await listSeries();
  const featured = [...series.filter((s) => s.is_featured), ...series.filter((s) => !s.is_featured)].slice(0, 5);
  const deck = featured.map((s) => ({
    slug: s.slug,
    title: s.title,
    synopsis: s.synopsis,
    genre: s.genre,
    episodes: episodeCount(s),
    ...posterProps(s),
  }));

  return (
    <>
      <CineHero items={deck} free={FREE_EPISODES} />
      <div className="wrap" style={{ paddingBottom: 30 }}>
        <ContinueWatching />

        <div className="row-h"><h2>Top 10 en México hoy</h2></div>
        {series.length ? (
          <div className="scroller top10">
            {series.slice(0, 10).map((s, i) => {
              const p = posterProps(s);
              return (
                <Link key={s.id} href={`/serie/${s.slug}`} className="t10">
                  <em>{i + 1}</em>
                  <div className={`poster ${p.className}`} style={p.style}><b>{s.title}</b></div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="empty">Aún no hay series publicadas.</p>
        )}

        <div className="row-h"><h2>Todas las series</h2><Link href="/series">Ver todo →</Link></div>
        <div className="scroller cols-poster">
          {series.map((s) => <SeriesCard key={s.id} s={s} />)}
        </div>
      </div>
    </>
  );
}
