"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "./Icons";

export type DeckItem = {
  slug: string;
  title: string;
  synopsis: string;
  genre: string;
  episodes: number;
  free: number;
  className: string;
  style?: React.CSSProperties;
};

// Portada de inicio: texto a la izquierda y las portadas en baraja a la derecha.
export default function CineHero({ items }: { items: DeckItem[] }) {
  const router = useRouter();
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  useEffect(() => {
    if (paused || n < 2) return;
    const t = setInterval(() => setFront((f) => (f + 1) % n), 5000);
    return () => clearInterval(t);
  }, [paused, n]);

  if (!n) return null;
  const cur = items[front];
  const pos = (i: number) => {
    const d = (i - front + n) % n;
    return d === 0 ? 0 : d === 1 ? 1 : d === n - 1 ? 2 : 3;
  };

  return (
    <header className="hero">
      <div className={`bg ${cur.className}`} style={cur.style} />
      <div className="wrap">
        <div className="copy" key={cur.slug}>
          <span className="meta">{cur.genre} · {cur.episodes} episodios · {cur.free} gratis</span>
          <h1>{cur.title}</h1>
          <p>{cur.synopsis}</p>
          <div className="ctas">
            <Link className="btn primary" href={`/ver/${cur.slug}`}><Play />Ver episodio 1 gratis</Link>
            <Link className="btn soft" href={`/serie/${cur.slug}`}>Más información</Link>
          </div>
        </div>
        <div className="deck" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {items.map((s, i) => (
            <div
              key={s.slug}
              className={`card ${s.className}`}
              style={s.style}
              data-pos={pos(i)}
              role="button"
              tabIndex={0}
              aria-label={s.title}
              onClick={() => (pos(i) === 0 ? router.push(`/serie/${s.slug}`) : setFront(i))}
              onKeyDown={(e) => e.key === "Enter" && (pos(i) === 0 ? router.push(`/serie/${s.slug}`) : setFront(i))}
            >
              <span className="badge">{i === 0 ? "🔥 Tendencia" : s.genre}</span>
              <span className="play"><Play /></span>
              <b>{s.title}</b>
              <small>{s.episodes} episodios</small>
            </div>
          ))}
          <div className="deck-dots">
            {items.map((s, i) => (
              <button key={s.slug} aria-label={`Ver ${s.title}`} aria-current={i === front} onClick={() => setFront(i)} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
