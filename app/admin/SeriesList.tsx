"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil } from "@/components/Icons";

export type AdminRow = {
  id: string; title: string; genre: string; eps: number; free: number; featured: boolean;
  thumbClass: string; thumbStyle?: React.CSSProperties;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SeriesList({ rows }: { rows: AdminRow[] }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? rows.filter((r) => norm(`${r.title} ${r.genre}`).includes(norm(q.trim()))) : rows;
  return (
    <>
      <input className="asearch" type="search" placeholder="Buscar serie por título o género…" aria-label="Buscar serie" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <p className="muted">Ninguna serie coincide con “{q}”.</p> : (
        <div className="alist">
          {shown.map((s) => (
            <Link key={s.id} href={`/admin/serie/${s.id}`} className="arow">
              <span className={`athumb ${s.thumbClass}`} style={s.thumbStyle} />
              <span className="ainfo">
                <b>{s.title}</b>
                <small>{s.genre || "Sin género"} · {s.eps} episodios · {s.free} gratis{s.featured ? " · ★ Destacada" : ""}</small>
              </span>
              <span className="ibtn" aria-label="Editar"><Pencil /></span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
