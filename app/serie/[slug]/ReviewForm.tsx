"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSession } from "@/lib/session-client";

export default function ReviewForm({ seriesId, slug }: { seriesId: string; slug: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setMsg({ text: "Elige de 1 a 5 estrellas.", err: true });
    setBusy(true);
    setMsg(null);
    await ensureSession();
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, slug, rating, body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? "No se pudo guardar.", err: true });
    setBody("");
    setMsg({ text: "¡Gracias! Tu reseña ya está publicada." });
    router.refresh();
  }

  return (
    <form className="rform" onSubmit={submit}>
      <div className="pick" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrellas`}
            className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea id="review-body" placeholder="¿Qué te pareció? Sin spoilers 😉" maxLength={500} required
        value={body} onChange={(e) => setBody(e.target.value)} />
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Publicando…" : "Publicar reseña"}</button>
    </form>
  );
}
