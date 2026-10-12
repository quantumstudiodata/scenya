"use client";

import { useState } from "react";

// En teléfono: pestañas. En escritorio el CSS muestra todo en columnas.
export default function SeriesTabs({ reviews, children }: { reviews: number; children: React.ReactNode }) {
  const [tab, setTab] = useState<"sinopsis" | "resenas" | "similares">("sinopsis");
  const tabs = [
    ["sinopsis", "Sinopsis"],
    ["resenas", `Reseñas (${reviews})`],
    ["similares", "Similares"],
  ] as const;
  return (
    <div data-tab={tab}>
      <div className="stabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div className="scols" ref={(el) => {
        el?.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => {
          p.dataset.on = String(p.dataset.pane!.split(" ").includes(tab));
        });
      }}>
        {children}
      </div>
    </div>
  );
}
