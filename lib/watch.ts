"use client";

// Progreso de "Continuar viendo", guardado en este navegador.
export type Watch = { slug: string; title: string; ep: number; total: number; className: string; poster: string | null; at: number };
const KEY = "scenya:watch";

export function readWatch(): Watch[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Watch>;
    return Object.values(all).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function saveWatch(w: Omit<Watch, "at">) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Watch>;
    all[w.slug] = { ...w, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
