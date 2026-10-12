import Link from "next/link";
import { episodeCount, type Series } from "@/lib/catalog";

export function posterStyle(s: Series, i: number) {
  return s.poster_url
    ? { className: "", style: { backgroundImage: `url(${s.poster_url})` } }
    : { className: `g${i % 6}`, style: undefined };
}

export default function SeriesCard({ s, i }: { s: Series; i: number }) {
  const p = posterStyle(s, i);
  return (
    <Link href={`/serie/${s.slug}`} className={`card ${p.className}`} style={p.style}>
      <span className="badge">{s.genre}</span>
      <b>{s.title}</b>
      <small>{episodeCount(s)} episodios</small>
    </Link>
  );
}
