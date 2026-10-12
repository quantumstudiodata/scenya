import Link from "next/link";
import { episodeCount, type Series } from "@/lib/catalog";
import { posterProps } from "@/lib/tone";

export default function SeriesCard({ s }: { s: Series }) {
  const p = posterProps(s);
  return (
    <Link href={`/serie/${s.slug}`} className={`poster ${p.className}`} style={p.style}>
      <span className="badge">{s.genre}</span>
      <b>{s.title}</b>
      <small>{episodeCount(s)} episodios</small>
    </Link>
  );
}
