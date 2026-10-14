"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { upload, saveEpisodeApi } from "@/lib/admin-upload";
import type { AdminEpisode } from "./SeriesEditor";

// Editor de episodios estilo TikTok/CapCut: el video completo de la serie se
// corta en el navegador (ffmpeg.wasm) y solo se suben los episodios. Los cortes
// se guardan como "proyecto" para retomarlo después; al guardar, solo se suben
// las partes nuevas o cambiadas.
// El worker de ffmpeg se sirve desde public/ffmpeg porque webpack rompe su carga dinámica.
const CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const MB = 1048576;
const LIMIT = 48 * MB; // Supabase gratis: 50 MB por archivo
const TARGET = 44 * MB;
const THUMB_W = 54;

type Uploaded = Record<string, { end: number; number: number }>;
type Project = {
  fileName: string; fileSize: number; duration: number;
  in: number; out: number | null; cuts: number[]; skip: number[];
  titles: Record<string, string>; first: number; uploaded: Uploaded;
};
type Piece = { start: number; end: number; skipped: boolean; number: number; status: "ok" | "move" | "new" | "off"; oldNumber?: number };

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (s: number, tenths = false) => {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${tenths ? sec.toFixed(1).padStart(4, "0") : String(Math.floor(sec)).padStart(2, "0")}`;
};

// El navegador puede recordar el archivo (Chrome/Edge) para no volver a buscarlo.
type Handle = { getFile(): Promise<File>; queryPermission?(o: object): Promise<string>; requestPermission?(o: object): Promise<string> };
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("scenya-editor", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("files");
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const req = fn(open.result.transaction("files", mode).objectStore("files"));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(undefined);
      };
    } catch { resolve(undefined); }
  });
}

type Props = { seriesId: string; episodes: AdminEpisode[]; onChanged: () => void; onClose: (changed: boolean) => void };

export default function EpisodeEditor({ seriesId, episodes, onChanged, onClose }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Project | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(24);
  const [thumbs, setThumbs] = useState<{ step: number; list: string[] }>({ step: 1, list: [] });
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [every, setEvery] = useState(60);
  const [changed, setChanged] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const ff = useRef<FFmpeg | null>(null);
  const say = (text: string, err = false) => setMsg({ text, err });

  // Carga el proyecto guardado.
  useEffect(() => {
    fetch(`/api/admin/project?seriesId=${seriesId}`).then((r) => r.json()).catch(() => ({}))
      .then((d) => { if (d?.project) setSaved(d.project); setLoaded(true); });
  }, [seriesId]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => ff.current?.terminate(), []);

  // Guardado automático de los cortes (sin subir nada) para retomar después.
  const persist = useCallback(async (proj: Project) => {
    await fetch("/api/admin/project", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seriesId, project: proj }),
    }).catch(() => {});
  }, [seriesId]);
  useEffect(() => {
    if (!p || busy) return;
    const id = setTimeout(() => persist(p), 800);
    return () => clearTimeout(id);
  }, [p, busy, persist]);

  const update = (fn: (x: Project) => Project) => setP((x) => (x ? fn(x) : x));

  // ---------- Archivo ----------
  async function openFile(f: File, handle?: Handle) {
    if (handle) await idb("readwrite", (s) => s.put(handle, seriesId));
    if (url) URL.revokeObjectURL(url);
    setFile(f); setUrl(URL.createObjectURL(f)); setThumbs({ step: 1, list: [] }); setMsg(null);
    if (saved && saved.fileName === f.name && saved.fileSize === f.size) setP(saved);
    else if (saved && !p) {
      setP({ ...saved, fileName: f.name, fileSize: f.size });
      say("Este video no es el mismo que usaste antes; revisa que los cortes coincidan.", true);
    } else if (!p) {
      setP({ fileName: f.name, fileSize: f.size, duration: 0, in: 0, out: null, cuts: [], skip: [], titles: {}, first: Math.max(0, ...episodes.map((e) => e.number)) + 1, uploaded: {} });
    } else setP({ ...p, fileName: f.name, fileSize: f.size });
  }

  async function pickFile() {
    const w = window as unknown as { showOpenFilePicker?: (o: object) => Promise<Handle[]> };
    if (w.showOpenFilePicker) {
      try {
        const [h] = await w.showOpenFilePicker({ types: [{ description: "Video", accept: { "video/*": [".mp4", ".mov", ".webm", ".m4v"] } }] });
        return openFile(await h.getFile(), h);
      } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    document.getElementById("ed-file")?.click();
  }

  async function reopen() {
    const h = await idb<Handle>("readonly", (s) => s.get(seriesId));
    if (h) {
      try {
        const ok = (await h.queryPermission?.({ mode: "read" })) === "granted" || (await h.requestPermission?.({ mode: "read" })) === "granted";
        if (ok) return openFile(await h.getFile());
      } catch { /* el archivo se movió o se borró */ }
    }
    pickFile();
  }

  // ---------- Miniaturas de la línea de tiempo ----------
  useEffect(() => {
    if (!url || !p?.duration) return;
    let stop = false;
    const v = document.createElement("video");
    v.src = url; v.muted = true; v.preload = "auto";
    const step = Math.max(1, p.duration / 150);
    const c = document.createElement("canvas");
    c.width = THUMB_W * 2; c.height = Math.round(THUMB_W * 2 * 16 / 9);
    const ctx = c.getContext("2d");
    (async () => {
      await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
      const list: string[] = [];
      for (let s = 0; s < p.duration && !stop; s += step) {
        v.currentTime = Math.min(s + 0.05, p.duration - 0.05);
        await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
        if (!ctx || !v.videoWidth) break;
        const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
        const w = v.videoWidth * scale, h = v.videoHeight * scale;
        ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
        list.push(c.toDataURL("image/jpeg", 0.55));
        if (list.length % 10 === 0) setThumbs({ step, list: [...list] });
      }
      if (!stop) setThumbs({ step, list });
    })();
    return () => { stop = true; v.removeAttribute("src"); v.load(); };
  }, [url, p?.duration]);

  // ---------- Línea de tiempo y reproducción ----------
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [file]);

  const scrollTo = useCallback((s: number) => {
    const el = scroller.current;
    if (!el) return;
    const x = s * pps;
    if (Math.abs(el.scrollLeft - x) < 1) return;
    syncing.current = true;
    el.scrollLeft = x;
  }, [pps]);

  useEffect(() => { scrollTo(video.current?.currentTime ?? 0); }, [pps, width, scrollTo]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const now = video.current?.currentTime ?? 0;
      setT(now); scrollTo(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scrollTo]);

  function onScroll() {
    if (syncing.current) { syncing.current = false; return; }
    const el = scroller.current, v = video.current;
    if (!el || !v || !p) return;
    if (!v.paused) v.pause();
    const s = Math.max(0, Math.min(p.duration, el.scrollLeft / pps));
    v.currentTime = s; setT(s);
  }

  function seek(s: number) {
    if (!video.current || !p) return;
    const x = Math.max(0, Math.min(p.duration, s));
    video.current.currentTime = x; setT(x); scrollTo(x);
  }

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }

  // ---------- Piezas ----------
  const outPt = p ? p.out ?? p.duration : 0;
  const pieces: Piece[] = useMemo(() => {
    if (!p || !p.duration) return [];
    const b = [p.in, ...p.cuts.filter((c) => c > p.in && c < outPt), outPt];
    const byNumber = new Map(episodes.map((e) => [e.number, e]));
    let n = p.first;
    return b.slice(0, -1).map((start, i) => {
      const end = b[i + 1];
      if (p.skip.includes(start)) return { start, end, skipped: true, number: 0, status: "off" as const };
      const number = n++;
      const up = p.uploaded[String(start)];
      const same = up && Math.abs(up.end - end) < 0.05;
      const exists = same && byNumber.get(up.number)?.hasVideo;
      const status = exists ? (up.number === number ? "ok" : "move") : "new";
      return { start, end, skipped: false, number, status, oldNumber: exists ? up.number : undefined } as Piece;
    });
  }, [p, outPt, episodes]);
  const kept = pieces.filter((x) => !x.skipped);
  const last = pieces[pieces.length - 1];
  const current = pieces.find((x) => t >= x.start && t < x.end) ?? (last && Math.abs(t - last.end) < 0.05 ? last : undefined);

  function split() {
    if (!p) return;
    const at = r1(video.current?.currentTime ?? t);
    if (at <= p.in + 0.5 || at >= outPt - 0.5 || p.cuts.some((c) => Math.abs(c - at) < 0.5)) return say("Muy cerca de otro corte o del borde.", true);
    update((x) => ({ ...x, cuts: [...x.cuts, at].sort((a, b) => a - b) }));
    setMsg(null);
  }
  function toggleDelete() {
    if (!current) return;
    update((x) => ({ ...x, skip: x.skip.includes(current.start) ? x.skip.filter((s) => s !== current.start) : [...x.skip, current.start] }));
  }
  function mergePrev() {
    if (!current || current.start === p?.in) return;
    update((x) => ({ ...x, cuts: x.cuts.filter((c) => c !== current.start), skip: x.skip.filter((s) => s !== current.start) }));
  }
  function markIn() {
    const at = r1(video.current?.currentTime ?? t);
    if (at < outPt - 1) update((x) => ({ ...x, in: at }));
  }
  function markOut() {
    const at = r1(video.current?.currentTime ?? t);
    if (p && at > p.in + 1) update((x) => ({ ...x, out: at >= x.duration - 0.1 ? null : at }));
  }
  function autoSplit() {
    if (!p) return;
    const step = Math.max(5, every), list: number[] = [];
    for (let s = p.in + step; s < outPt - 1; s += step) list.push(r1(s));
    update((x) => ({ ...x, cuts: list, skip: [] }));
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!file || busy || confirm || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); toggle(); }
      else if (k === "s" || k === "c") { e.preventDefault(); split(); }
      else if (k === "delete" || k === "backspace") { e.preventDefault(); toggleDelete(); }
      else if (k === "i") { e.preventDefault(); markIn(); }
      else if (k === "o") { e.preventDefault(); markOut(); }
      else if (k === "arrowleft") { e.preventDefault(); seek((video.current?.currentTime ?? 0) - (e.shiftKey ? 1 : 0.1)); }
      else if (k === "arrowright") { e.preventDefault(); seek((video.current?.currentTime ?? 0) + (e.shiftKey ? 1 : 0.1)); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---------- Guardar y subir ----------
  const usedNumbers = new Set(kept.map((x) => x.number));
  const reusedOld = new Set(kept.filter((x) => x.oldNumber).map((x) => x.oldNumber!));
  const tracked = p ? Object.values(p.uploaded).map((u) => u.number) : [];
  const toDelete = [...new Set(tracked)].filter((n) => !reusedOld.has(n) && !usedNumbers.has(n)).sort((a, b) => a - b);
  const toUpload = kept.filter((x) => x.status === "new");
  const toMove = kept.filter((x) => x.status === "move");
  const replacing = toUpload.filter((x) => episodes.some((e) => e.number === x.number && e.hasVideo)).map((x) => x.number);
  const pending = toUpload.length + toMove.length + toDelete.length;

  async function loadFFmpeg() {
    if (ff.current) return ff.current;
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const f = new FFmpeg();
    await f.load({
      classWorkerURL: `${location.origin}/ffmpeg/worker.js`,
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ff.current = f;
    return f;
  }

  async function cut(f: FFmpeg, input: string, s: Piece, label: string) {
    const prog = (what: string) => ({ progress }: { progress: number }) =>
      setBusy(`${what} ${label}… ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`);
    let on = prog("Cortando");
    f.on("progress", on);
    const code = await f.exec([
      "-ss", s.start.toFixed(2), "-i", input, "-t", (s.end - s.start).toFixed(2),
      "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", "out.mp4",
    ]);
    f.off("progress", on);
    if (code !== 0) throw new Error(`No se pudo cortar el ${label}.`);
    let data = (await f.readFile("out.mp4")) as Uint8Array;
    await f.deleteFile("out.mp4");
    if (data.byteLength > LIMIT) {
      // Demasiado pesado para el almacenamiento: se comprime a 720p con la tasa justa.
      const kbps = Math.max(400, Math.floor((TARGET * 8) / (s.end - s.start) / 1000) - 128);
      await f.writeFile("big.mp4", data);
      on = prog(`Comprimiendo (pesaba ${(data.byteLength / MB).toFixed(0)} MB)`);
      f.on("progress", on);
      const zip = await f.exec([
        "-i", "big.mp4", "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "small.mp4",
      ]);
      f.off("progress", on);
      await f.deleteFile("big.mp4");
      if (zip !== 0) throw new Error(`No se pudo comprimir el ${label}.`);
      data = (await f.readFile("small.mp4")) as Uint8Array;
      await f.deleteFile("small.mp4");
      if (data.byteLength > 50 * MB) throw new Error(`El ${label} sigue pesando más de 50 MB. Divídelo en partes más cortas.`);
    }
    return new File([data as BlobPart], `episodio-${s.number}.mp4`, { type: "video/mp4" });
  }

  async function save(markOnly = false) {
    if (!p || !file) return;
    setConfirm(null); setMsg(null);
    const title = (x: Piece) => p.titles[String(x.start)]?.trim() || `Episodio ${x.number}`;
    let proj: Project = { ...p };
    try {
      if (markOnly) {
        // Los episodios ya están subidos con estos cortes: solo se recuerda.
        const uploaded: Uploaded = {};
        for (const x of kept) uploaded[String(x.start)] = { end: x.end, number: x.number };
        proj = { ...proj, uploaded };
      } else {
        // 1. Borra episodios que ya no existen en el proyecto.
        for (const n of toDelete) {
          setBusy(`Borrando episodio ${n}…`);
          const ep = episodes.find((e) => e.number === n);
          if (ep) await fetch(`/api/admin/episodes?id=${ep.id}`, { method: "DELETE" });
        }
        const uploaded: Uploaded = {};
        // 2. Reordena los que solo cambiaron de número (sin volver a subirlos).
        if (toMove.length) {
          setBusy("Reordenando episodios…");
          const r = await fetch("/api/admin/episodes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "renumber", seriesId, moves: toMove.map((x) => ({ from: x.oldNumber, to: x.number })) }),
          });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudieron reordenar los episodios.");
        }
        for (const x of kept) if (x.status !== "new") uploaded[String(x.start)] = { end: x.end, number: x.number };
        proj = { ...proj, uploaded };
        await persist(proj);
        // 3. Títulos de los que no se vuelven a subir.
        for (const x of kept.filter((k) => k.status !== "new")) {
          const before = episodes.find((e) => e.number === (x.oldNumber ?? x.number))?.title;
          if (before !== title(x)) await saveEpisodeApi({ seriesId, number: x.number, title: title(x) });
        }
        // 4. Corta y sube las partes nuevas o cambiadas.
        if (toUpload.length) {
          setBusy("Preparando el editor (la primera vez descarga ~30 MB)…");
          const f = await loadFFmpeg();
          const { FFFSType } = await import("@ffmpeg/ffmpeg");
          await f.createDir("/in").catch(() => {});
          await f.mount(FFFSType.WORKERFS, { files: [file] }, "/in");
          try {
            for (let i = 0; i < toUpload.length; i++) {
              const x = toUpload[i];
              const label = `episodio ${x.number} (${i + 1} de ${toUpload.length})`;
              const ep = await cut(f, `/in/${file.name}`, x, label);
              setBusy(`Subiendo ${label} · ${(ep.size / MB).toFixed(1)} MB…`);
              const { path } = await upload("video", ep);
              await saveEpisodeApi({ seriesId, number: x.number, title: title(x), videoPath: path, duration: x.end - x.start });
              proj = { ...proj, uploaded: { ...proj.uploaded, [String(x.start)]: { end: x.end, number: x.number } } };
              await persist(proj);
            }
          } finally {
            await f.unmount("/in").catch(() => {});
          }
        }
      }
      await persist(proj);
      setP(proj); setSaved(proj); setChanged(true); onChanged();
      setBusy("");
      say(markOnly ? "Cortes guardados." : "Listo: episodios actualizados.");
    } catch (e) {
      setBusy("");
      setP(proj); setChanged(true); onChanged();
      say((e as Error).message || "Algo falló al guardar.", true);
    }
  }

  function close() {
    if (busy) { ff.current?.terminate(); ff.current = null; setBusy(""); say("Proceso cancelado. Lo ya subido se conservó.", true); return; }
    onClose(changed);
  }

  const track = p ? p.duration * pps : 0;
  const tick = pps >= 40 ? 1 : pps >= 12 ? 5 : pps >= 4 ? 10 : 30;

  return (
    <div className="veil ed-veil" role="dialog" aria-modal="true" aria-label="Editor de episodios">
      <div className="ed">
        <header className="ed-top">
          <button className="btn soft small" onClick={close}>{busy ? "Cancelar" : "✕ Cerrar"}</button>
          <b>Editor de episodios</b>
          {file && p ? (
            <button className="btn primary small" onClick={() => (toDelete.length || replacing.length ? setConfirm([...toDelete.map((n) => `Se borrará el episodio ${n}.`), ...(replacing.length ? [`Se reemplazará el video de: ${replacing.join(", ")}.`] : [])]) : save())} disabled={!!busy || !pending}>
              {pending ? `Guardar (${pending})` : "Guardado ✓"}
            </button>
          ) : <span />}
        </header>

        {!loaded ? <p className="muted ed-pad">Cargando…</p> : !file || !p ? (
          <div className="ed-pad ed-start">
            {saved ? (
              <>
                <b>Continuar donde te quedaste</b>
                <span className="muted">{saved.fileName} · {(saved.fileSize / MB).toFixed(0)} MB · {saved.cuts.length + 1} partes</span>
                <button className="btn primary" onClick={reopen}>Abrir video y continuar</button>
                <button className="btn soft small" onClick={() => { setSaved(null); pickFile(); }}>Empezar con otro video</button>
              </>
            ) : (
              <>
                <b>Elige el video completo de la serie</b>
                <span className="muted">Se corta aquí en tu navegador; solo se suben los episodios. Usa computadora con Chrome o Edge.</span>
                <button className="btn primary" onClick={pickFile}>Elegir video</button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="ed-stage">
              <video
                ref={video} src={url} playsInline className="ed-video" onClick={toggle}
                onLoadedMetadata={(e) => { const d = e.currentTarget.duration; update((x) => ({ ...x, duration: d, out: x.out && x.out < d ? x.out : null })); }}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onSeeked={(e) => !playing && setT(e.currentTarget.currentTime)}
              />
              {current && (
                <span className={`ed-badge ${current.status}`}>
                  {current.skipped ? "Eliminado" : `Episodio ${current.number}`}
                </span>
              )}
            </div>

            <div className="ed-bar">
              <span className="tcode">{fmt(t, true)}</span>
              <button className="ed-play" onClick={toggle} aria-label={playing ? "Pausa" : "Reproducir"}>{playing ? "❚❚" : "▶"}</button>
              <span className="tcode muted">{fmt(p.duration)}</span>
            </div>

            <div className="ed-tl">
              <div className="ed-scroll" ref={scroller} onScroll={onScroll}
                onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setPps((z) => Math.min(200, Math.max(2, z * (e.deltaY < 0 ? 1.2 : 0.83)))); } }}>
                <div className="ed-inner" style={{ width: track + width, paddingInline: width / 2 }}>
                  <div className="ed-ruler" style={{ width: track }}>
                    {Array.from({ length: Math.floor(p.duration / tick) + 1 }, (_, i) => (
                      <span key={i} style={{ left: i * tick * pps }}>{fmt(i * tick)}</span>
                    ))}
                  </div>
                  <div className="ed-track" style={{ width: track }}>
                    <div className="ed-thumbs">
                      {thumbs.list.map((src, i) => (
                        <img key={i} src={src} alt="" style={{ left: i * thumbs.step * pps, width: Math.max(1, thumbs.step * pps) }} />
                      ))}
                    </div>
                    {pieces.map((x) => (
                      <button key={x.start} className={`ed-clip ${x.status} ${current?.start === x.start ? "sel" : ""}`}
                        style={{ left: x.start * pps, width: Math.max(2, (x.end - x.start) * pps) }}
                        onClick={(e) => { e.stopPropagation(); seek(x.start + 0.05); }}>
                        <small>{x.skipped ? "✕" : x.number}</small>
                      </button>
                    ))}
                    {p.in > 0 && <span className="ed-trim" style={{ left: 0, width: p.in * pps }} />}
                    {outPt < p.duration && <span className="ed-trim" style={{ left: outPt * pps, right: 0 }} />}
                  </div>
                </div>
              </div>
              <i className="ed-head" aria-hidden />
            </div>

            <div className="ed-tools">
              <button onClick={split} disabled={!!busy}><span>✂</span>Dividir</button>
              <button onClick={toggleDelete} disabled={!!busy || !current}><span>{current?.skipped ? "↺" : "🗑"}</span>{current?.skipped ? "Restaurar" : "Eliminar"}</button>
              <button onClick={mergePrev} disabled={!!busy || !current || current.start === p.in}><span>⇤</span>Unir</button>
              <button onClick={markIn} disabled={!!busy}><span>⟦</span>Inicio</button>
              <button onClick={markOut} disabled={!!busy}><span>⟧</span>Fin</button>
              <button onClick={() => setPps((z) => Math.max(2, z / 1.5))}><span>−</span>Alejar</button>
              <button onClick={() => setPps((z) => Math.min(200, z * 1.5))}><span>+</span>Acercar</button>
            </div>

            {current && !current.skipped && (
              <div className="ed-pad ed-info">
                <b className={`epn ${current.status === "new" ? "lockd" : ""}`}>{current.number}</b>
                <input aria-label={`Título del episodio ${current.number}`} placeholder={`Episodio ${current.number}`}
                  value={p.titles[String(current.start)] ?? ""} onChange={(e) => update((x) => ({ ...x, titles: { ...x.titles, [String(current.start)]: e.target.value } }))} />
                <span className={`ed-st ${current.status}`}>
                  {current.status === "ok" ? "✓ Subido" : current.status === "move" ? `✓ Subido (era el ${current.oldNumber})` : "● Por subir"} · {Math.round(current.end - current.start)} s
                </span>
              </div>
            )}

            <div className="ed-pad ed-more">
              <div className="ed-chips">
                {pieces.map((x) => (
                  <button key={x.start} className={`ed-chip ${x.status} ${current?.start === x.start ? "sel" : ""}`} onClick={() => seek(x.start + 0.05)}>
                    {x.skipped ? "✕" : x.number}
                  </button>
                ))}
              </div>
              <div className="acts" style={{ alignItems: "center" }}>
                <label className="inline">Dividir cada <input type="number" min={5} value={every} onChange={(e) => setEvery(Number(e.target.value))} /> s</label>
                <button className="btn soft small" onClick={autoSplit} disabled={!!busy}>Aplicar</button>
                <label className="inline">Empieza en el episodio <input type="number" min={1} value={p.first} onChange={(e) => update((x) => ({ ...x, first: Math.max(1, Number(e.target.value) || 1) }))} /></label>
                <button className="btn soft small" onClick={pickFile} disabled={!!busy}>Cambiar video</button>
              </div>
              {toUpload.length > 0 && replacing.length === toUpload.length && !Object.keys(p.uploaded).length && (
                <p className="muted" style={{ fontSize: 12 }}>
                  ¿Ya subiste estos episodios con el editor anterior y los cortes son los mismos?{" "}
                  <button className="linkish" onClick={() => save(true)} disabled={!!busy}>Marcarlos como subidos</button> para no volver a subirlos.
                </p>
              )}
              {(busy || msg) && <p className={`msg${msg?.err && !busy ? " err" : ""}`}>{busy || msg?.text}</p>}
              <p className="muted" style={{ fontSize: 12 }}>
                Desliza la línea de tiempo para moverte. <b>S</b> divide, <b>Supr</b> elimina, <b>I</b>/<b>O</b> recortan inicio y fin, <b>espacio</b> reproduce, Ctrl + rueda hace zoom. Tus cortes se guardan solos; “Guardar” sube solo lo nuevo o cambiado.
              </p>
            </div>
          </>
        )}

        {confirm && (
          <div className="ed-confirm">
            <b>¿Guardar cambios?</b>
            {confirm.map((c) => <span key={c} className="muted">{c}</span>)}
            <div className="acts">
              <button className="btn primary" onClick={() => save()}>Sí, guardar</button>
              <button className="btn soft" onClick={() => setConfirm(null)}>Cancelar</button>
            </div>
          </div>
        )}
        <input id="ed-file" type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}
