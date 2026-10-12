import Link from "next/link";
import SeriesCard, { posterStyle } from "@/components/SeriesCard";
import { listSeries, episodeCount } from "@/lib/catalog";
import { FREE_EPISODES } from "@/lib/access";

export default async function Home() {
  const series = await listSeries();
  const featured = series.find((s) => s.is_featured) ?? series[0];
  const fi = featured ? series.indexOf(featured) : 0;
  const fp = featured ? posterStyle(featured, fi) : null;

  return (
    <div className="wrap">
      <header className="hero">
        <div>
          <span className="tag">Estrenos cada semana</span>
          <h1>Historias que no puedes <em>dejar de ver</em></h1>
          <p>Miniseries en episodios cortos. Una sola membresía abre todo el catálogo. Sin monedas, sin trucos.</p>
          <div className="cta">
            <Link className="btn primary" href="/planes">Empezar con Acceso Total</Link>
            {featured && (
              <Link className="btn ghost" href={`/serie/${featured.slug}`}>Ver gratis</Link>
            )}
          </div>
          <div className="stats">
            <div><b>{series.length}</b>series</div>
            <div><b>{FREE_EPISODES}</b>episodios gratis por serie</div>
            <div><b>0</b>monedas</div>
          </div>
        </div>
        {featured && fp && (
          <Link href={`/serie/${featured.slug}`} className={`feature ${fp.className}`} style={fp.style}>
            <span className="badge">Tendencia</span>
            <h2>{featured.title}</h2>
            <small>{episodeCount(featured)} episodios · {featured.genre}</small>
          </Link>
        )}
      </header>

      <section>
        <div className="head">
          <h2>Tendencias ahora</h2>
          <Link className="muted" href="/series">Ver todo →</Link>
        </div>
        {series.length ? (
          <div className="row">
            {series.map((s, i) => <SeriesCard key={s.id} s={s} i={i} />)}
          </div>
        ) : (
          <p className="muted">Aún no hay series publicadas.</p>
        )}
      </section>
    </div>
  );
}
