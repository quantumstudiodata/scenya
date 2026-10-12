"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readWatch, type Watch } from "@/lib/watch";

export default function ContinueWatching() {
  const [items, setItems] = useState<Watch[]>([]);
  useEffect(() => setItems(readWatch().slice(0, 8)), []);
  if (!items.length) return null;

  return (
    <section style={{ padding: 0 }}>
      <div className="row-h"><h2>Continuar viendo</h2></div>
      <div className="scroller cols-cont">
        {items.map((w) => (
          <Link key={w.slug} href={`/ver/${w.slug}?ep=${w.ep}`}>
            <div className={`poster wide ${w.poster ? "" : w.className}`} style={w.poster ? { backgroundImage: `url(${w.poster})` } : undefined}>
              <b>{w.title}</b>
              <small>Episodio {w.ep} de {w.total}</small>
            </div>
            <div className="prog"><i style={{ width: `${Math.round((w.ep / Math.max(w.total, 1)) * 100)}%` }} /></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
