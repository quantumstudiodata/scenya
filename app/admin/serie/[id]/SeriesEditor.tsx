"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { slugify } from "@/lib/slug";

export type AdminSeries = {
  id: string; slug: string; title: string; genre: string; synopsis: string;
  poster_url: string | null; free_episodes: number; is_featured: boolean;
};
export type AdminEpisode = { id: string; number: number; title: string; hasVideo: boolean };

const GENRES = ["Romance", "Drama", "Venganza", "CEO", "Suspenso", "Fantasía", "Familia", "Comedia"];

// Sube un archivo directo al almacenamiento de Supabase con un enlace firmado.
async function upload(kind: "poster" | "video", file: File) {
  const ext = file.name.split(".").pop() ?? (kind === "video" ? "mp4" : "jpg");
  const r = await fetch("/api/admin/upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ext }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "No se pudo preparar la subida.");
  const { error } = await createClient().storage.from(d.bucket).uploadToSignedUrl(d.path, d.token, file, { contentType: file.type });
  if (error) throw new Error(error.message.includes("size") ? "El archivo es demasiado grande." : "No se pudo subir el archivo.");
  return { path: d.path as string, publicUrl: d.publicUrl as string | null };
}

export default function SeriesEditor({ series, episodes: initial }: { series: AdminSeries | null; episodes: AdminEpisode[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: series?.title ?? "", slug: series?.slug ?? "", genre: series?.genre ?? "Romance",
    synopsis: series?.synopsis ?? "", free_episodes: series?.free_episodes ?? 10,
    is_featured: series?.is_featured ?? false, poster_url: series?.poster_url ?? null as string | null,
  });
  const [episodes, setEpisodes] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bulk = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const say = (text: string, err = false) => setMsg({ text, err });

  async function savePoster(file: File) {
    setBusy("Subiendo portada…");
    try {
      const { publicUrl } = await upload("poster", file);
      set("poster_url", publicUrl);
      say("Portada lista. Guarda los cambios para publicarla.");
    } catch (e) { say((e as Error).message, true); }
    setBusy("");
  }

  async function save() {
    setBusy("Guardando…");
    const r = await fetch("/api/admin/series", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: series?.id, slug: form.slug || slugify(form.title) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) return say(d.error ?? "No se pudo guardar.", true);
    say("Cambios guardados.");
    if (!series) router.replace(`/admin/serie/${d.series.id}`);
    else router.refresh();
  }

  async function saveEpisode(number: number, title: string, file?: File) {
    if (!series) return;
    let videoPath: string | undefined;
    if (file) videoPath = (await upload("video", file)).path;
    const r = await fetch("/api/admin/episodes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: series.id, number, title, videoPath }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "No se pudo guardar el episodio.");
    setEpisodes((list) => {
      const rest = list.filter((e) => e.number !== number);
      const prev = list.find((e) => e.number === number);
      return [...rest, { id: d.episode.id, number, title: d.episode.title, hasVideo: !!file || !!prev?.hasVideo }].sort((a, b) => a.number - b.number);
    });
  }

  async function addVideos(files: FileList | null) {
    if (!files?.length) return;
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    let next = Math.max(0, ...episodes.map((e) => e.number)) + 1;
    try {
      for (let i = 0; i < sorted.length; i++) {
        setBusy(`Subiendo video ${i + 1} de ${sorted.length}…`);
        await saveEpisode(next, `Episodio ${next}`, sorted[i]);
        next++;
      }
      say(`${sorted.length} episodio(s) agregado(s).`);
    } catch (e) { say((e as Error).message, true); }
    setBusy("");
    if (bulk.current) bulk.current.value = "";
    router.refresh();
  }

  async function replaceVideo(ep: AdminEpisode, file: File) {
    setBusy(`Subiendo video del episodio ${ep.number}…`);
    try { await saveEpisode(ep.number, ep.title, file); say(`Video del episodio ${ep.number} reemplazado.`); }
    catch (e) { say((e as Error).message, true); }
    setBusy("");
  }

  async function renameEpisode(ep: AdminEpisode, title: string) {
    if (title.trim() === ep.title) return;
    try { await saveEpisode(ep.number, title); } catch (e) { say((e as Error).message, true); }
  }

  async function deleteEpisode(ep: AdminEpisode) {
    setBusy(`Borrando episodio ${ep.number}…`);
    const r = await fetch(`/api/admin/episodes?id=${ep.id}`, { method: "DELETE" });
    setBusy("");
    if (!r.ok) return say("No se pudo borrar el episodio.", true);
    setEpisodes((l) => l.filter((e) => e.id !== ep.id));
  }

  async function deleteSeries() {
    if (!series) return;
    setBusy("Borrando serie…");
    const r = await fetch(`/api/admin/series?id=${series.id}`, { method: "DELETE" });
    setBusy("");
    if (!r.ok) return say("No se pudo borrar la serie.", true);
    router.replace("/admin");
  }

  return (
    <div className="wrap admin">
      <Link className="muted" href="/admin">← Todas las series</Link>
      <h2 style={{ margin: "10px 0 18px" }}>{series ? `Editar: ${series.title}` : "Nueva serie"}</h2>

      <div className="aform">
        <label className="poster-pick" htmlFor="poster-file">
          <span className={`athumb big ${form.poster_url ? "" : "t1"}`} style={form.poster_url ? { backgroundImage: `url(${form.poster_url})` } : undefined}>
            {!form.poster_url && <small>Sin portada</small>}
          </span>
          <span className="btn soft">Subir portada</span>
          <small className="muted">Vertical 2:3, JPG o PNG</small>
          <input id="poster-file" type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && savePoster(e.target.files[0])} />
        </label>

        <div className="afields">
          <label htmlFor="s-title">Título
            <input id="s-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="El Contrato de los Siete Días" />
          </label>
          <label htmlFor="s-slug">Enlace (slug)
            <input id="s-slug" value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder={slugify(form.title) || "el-contrato-de-los-siete-dias"} />
          </label>
          <div className="arow2">
            <label htmlFor="s-genre">Género
              <select id="s-genre" value={form.genre} onChange={(e) => set("genre", e.target.value)}>
                {GENRES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label htmlFor="s-free">Episodios gratis
              <input id="s-free" type="number" min={0} max={500} value={form.free_episodes} onChange={(e) => set("free_episodes", Number(e.target.value))} />
              <small className="muted">Se bloquea desde el episodio {form.free_episodes + 1}</small>
            </label>
          </div>
          <label htmlFor="s-syn">Sinopsis
            <textarea id="s-syn" rows={4} value={form.synopsis} onChange={(e) => set("synopsis", e.target.value)} />
          </label>
          <label className="check" htmlFor="s-feat">
            <input id="s-feat" type="checkbox" checked={form.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
            Mostrar en la portada de inicio (destacada)
          </label>
          <div className="acts">
            <button className="btn primary" onClick={save} disabled={!!busy || !form.title.trim()}>{series ? "Guardar cambios" : "Crear serie"}</button>
            {series && <Link className="btn soft" href={`/serie/${series.slug}`} target="_blank">Ver en el sitio</Link>}
          </div>
        </div>
      </div>

      {(busy || msg) && <p className={`msg${msg?.err && !busy ? " err" : ""}`} style={{ marginTop: 16 }}>{busy || msg?.text}</p>}

      {series && (
        <section>
          <div className="head">
            <h2>Episodios ({episodes.length})</h2>
            <label className="btn primary" htmlFor="bulk-videos">+ Agregar videos</label>
            <input ref={bulk} id="bulk-videos" type="file" accept="video/*" multiple hidden onChange={(e) => addVideos(e.target.files)} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Puedes elegir varios videos a la vez; se numeran en orden por nombre de archivo (ep01.mp4, ep02.mp4…). Máximo 50 MB por video en el plan gratis de Supabase.
          </p>
          {episodes.length === 0 ? <p className="muted">Sin episodios todavía.</p> : (
            <div className="alist">
              {episodes.map((ep) => (
                <div key={ep.id} className="arow ep-row">
                  <b className={`epn ${ep.number > form.free_episodes ? "lockd" : ""}`}>{ep.number}</b>
                  <input aria-label={`Título del episodio ${ep.number}`} defaultValue={ep.title} onBlur={(e) => renameEpisode(ep, e.target.value)} />
                  <span className={`vstat ${ep.hasVideo ? "ok" : ""}`}>{ep.hasVideo ? "Video ✓" : "Sin video"}</span>
                  <label className="btn soft small" htmlFor={`v-${ep.id}`}>{ep.hasVideo ? "Reemplazar" : "Subir video"}</label>
                  <input id={`v-${ep.id}`} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && replaceVideo(ep, e.target.files[0])} />
                  <button className="btn soft small danger" onClick={() => deleteEpisode(ep)} aria-label={`Borrar episodio ${ep.number}`}>Borrar</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 40, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            {confirmDelete ? (
              <div className="acts">
                <span className="muted">¿Borrar la serie y todos sus episodios? No se puede deshacer.</span>
                <button className="btn soft danger" onClick={deleteSeries}>Sí, borrar</button>
                <button className="btn soft" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              </div>
            ) : (
              <button className="btn soft danger" onClick={() => setConfirmDelete(true)}>Borrar serie</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
