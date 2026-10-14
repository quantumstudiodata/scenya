"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { upload, saveEpisodeApi } from "@/lib/admin-upload";
import type { AdminEpisode } from "./SeriesEditor";

// Editor de episodios estilo TikTok/CapCut. La línea de tiempo es una fila de
// episodios; cada episodio es uno o más "clips" (tramos de un video fuente).
// Todo se corta en el navegador (ffmpeg.wasm) y solo se suben los episodios.
// Los cambios se guardan como proyecto para retomarlo; al guardar solo se sube
// lo nuevo o cambiado. El worker de ffmpeg vive en public/ffmpeg porque webpack
// rompe su carga dinámica.
const CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const MB = 1048576;
const LIMIT = 48 * MB; // Supabase gratis: 50 MB por archivo
const TARGET = 44 * MB;
const MIN = 0.3; // duración mínima de un clip (s)

type Source = { name: string; size: number; duration: number };
type Clip = { src: number; in: number; out: number };
type Ep = { key: string; clips: Clip[]; title: string };
type Project = { v: 2; sources: Source[]; episodes: Ep[]; first: number; uploaded: Record<string, number> };
type Edit = Pick<Project, "sources" | "episodes" | "first">;
type Status = "ok" | "move" | "new";

const r2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 10);
const len = (c: Clip) => c.out - c.in;
const epLen = (e: Ep) => e.clips.reduce((a, c) => a + len(c), 0);
const fmt = (s: number, tenths = false) => {
  const m = Math.floor(s / 60), sec = Math.max(0, s - m * 60);
  return `${String(m).padStart(2, "0")}:${tenths ? sec.toFixed(1).padStart(4, "0") : String(Math.floor(sec)).padStart(2, "0")}`;
};

// Proyectos de la versión anterior (cortes sobre un solo video) → versión 2.
type V1 = { fileName: string; fileSize: number; duration: number; in: number; out: number | null; cuts: number[]; skip: number[]; titles: Record<string, string>; first: number; uploaded: Record<string, { end: number; number: number }> };
function migrate(raw: unknown): Project | null {
  const x = raw as Partial<Project> & Partial<V1>;
  if (!x) return null;
  if (x.v === 2) return x as Project;
  if (!x.fileName || !x.duration) return null;
  const src: Source = { name: x.fileName, size: x.fileSize ?? 0, duration: x.duration };
  const out = x.out ?? x.duration;
  const b = [x.in ?? 0, ...(x.cuts ?? []).filter((c) => c > (x.in ?? 0) && c < out), out];
  const episodes: Ep[] = [];
  const uploaded: Record<string, number> = {};
  b.slice(0, -1).forEach((start, i) => {
    if (x.skip?.includes(start)) return;
    const ep: Ep = { key: uid(), clips: [{ src: 0, in: start, out: b[i + 1] }], title: x.titles?.[String(start)] ?? "" };
    const up = x.uploaded?.[String(start)];
    if (up && Math.abs(up.end - b[i + 1]) < 0.05) uploaded[sig(ep, [src])] = up.number;
    episodes.push(ep);
  });
  return { v: 2, sources: [src], episodes, first: x.first ?? 1, uploaded };
}
function sig(e: Ep, sources: Source[]) {
  return e.clips.map((c) => `${sources[c.src]?.name}|${sources[c.src]?.size}|${c.in.toFixed(2)}|${c.out.toFixed(2)}`).join("+");
}

// El navegador puede recordar los archivos (Chrome/Edge) para no buscarlos otra vez.
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
const handleKey = (s: Source) => `${s.name}|${s.size}`;
async function pickVideo(): Promise<{ file: File; handle?: Handle } | null> {
  const w = window as unknown as { showOpenFilePicker?: (o: object) => Promise<Handle[]> };
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: [{ description: "Video", accept: { "video/*": [".mp4", ".mov", ".webm", ".m4v"] } }] });
      return { file: await h.getFile(), handle: h };
    } catch (e) { if ((e as Error).name === "AbortError") return null; }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "video/*";
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0] } : null);
    input.click();
  });
}
function videoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    const u = URL.createObjectURL(file);
    v.preload = "metadata"; v.src = u;
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(u); };
    v.onerror = () => { reject(new Error("Este navegador no puede leer ese video. Exporta en MP4 (H.264).")); URL.revokeObjectURL(u); };
  });
}

type Props = { seriesId: string; episodes: AdminEpisode[]; onChanged: () => void; onClose: (changed: boolean) => void };

export default function EpisodeEditor({ seriesId, episodes, onChanged, onClose }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [p, setP] = useState<Project | null>(null);
  const [files, setFiles] = useState<(File | null)[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(24);
  const [thumbs, setThumbs] = useState<Record<number, { step: number; list: string[] }>>({});
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [every, setEvery] = useState(60);
  const [changed, setChanged] = useState(false);
  const [hist, setHist] = useState<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const [drag, setDrag] = useState(false);
  const [trimming, setTrimming] = useState<number | null>(null);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const active = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const ff = useRef<FFmpeg | null>(null);
  const tRef = useRef(0);
  const say = (text: string, err = false) => setMsg({ text, err });

  useEffect(() => {
    fetch(`/api/admin/project?seriesId=${seriesId}`).then((r) => r.json()).catch(() => ({}))
      .then((d) => { setP(migrate(d?.project)); setLoaded(true); });
  }, [seriesId]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  useEffect(() => () => ff.current?.terminate(), []);

  // Guardado automático del proyecto (sin subir nada).
  const persist = useCallback(async (proj: Project) => {
    await fetch("/api/admin/project", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seriesId, project: proj }),
    }).catch(() => {});
  }, [seriesId]);
  useEffect(() => {
    if (!p || !started || busy) return;
    const id = setTimeout(() => persist(p), 800);
    return () => clearTimeout(id);
  }, [p, started, busy, persist]);

  // ---------- Historial (deshacer / rehacer) ----------
  const snap = (x: Project): string => JSON.stringify({ sources: x.sources, episodes: x.episodes, first: x.first });
  function commit(fn: (x: Project) => Project) {
    if (!p) return;
    const next = fn(p);
    if (snap(next) === snap(p)) return;
    setHist((h) => ({ undo: [...h.undo.slice(-99), snap(p)], redo: [] }));
    setP(next);
  }
  function undo() {
    if (!p || !hist.undo.length) return;
    const prev = JSON.parse(hist.undo[hist.undo.length - 1]) as Edit;
    setHist((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, snap(p)] }));
    setP({ ...p, ...prev });
  }
  function redo() {
    if (!p || !hist.redo.length) return;
    const next = JSON.parse(hist.redo[hist.redo.length - 1]) as Edit;
    setHist((h) => ({ undo: [...h.undo, snap(p)], redo: h.redo.slice(0, -1) }));
    setP({ ...p, ...next });
  }

  // ---------- Archivos fuente ----------
  async function attach(i: number, file: File, handle?: Handle) {
    if (handle && p?.sources[i]) await idb("readwrite", (s) => s.put(handle, handleKey(p.sources[i])));
    setFiles((f) => { const n = [...f]; n[i] = file; return n; });
    setUrls((u) => { const n = [...u]; if (n[i]) URL.revokeObjectURL(n[i]); n[i] = URL.createObjectURL(file); return n; });
  }

  async function startNew() {
    const got = await pickVideo();
    if (!got) return;
    try {
      const duration = await videoDuration(got.file);
      const src: Source = { name: got.file.name, size: got.file.size, duration };
      if (got.handle) await idb("readwrite", (s) => s.put(got.handle, handleKey(src)));
      const proj: Project = {
        v: 2, sources: [src], episodes: [{ key: uid(), clips: [{ src: 0, in: 0, out: r2(duration) }], title: "" }],
        first: Math.max(0, ...episodes.map((e) => e.number)) + 1, uploaded: p?.uploaded ?? {},
      };
      setP(proj); setHist({ undo: [], redo: [] });
      setFiles([got.file]); setUrls([URL.createObjectURL(got.file)]); setThumbs({}); setStarted(true); setMsg(null);
    } catch (e) { say((e as Error).message, true); }
  }

  // Reabre un proyecto: intenta con los archivos recordados; si falta alguno, lo pide.
  async function reopen(i?: number) {
    if (!p) return;
    const list = i === undefined ? p.sources.map((_, k) => k) : [i];
    for (const k of list) {
      if (files[k]) continue;
      const s = p.sources[k];
      const h = await idb<Handle>("readonly", (st) => st.get(handleKey(s)));
      if (h) {
        try {
          const ok = (await h.queryPermission?.({ mode: "read" })) === "granted" || (await h.requestPermission?.({ mode: "read" })) === "granted";
          if (ok) { await attach(k, await h.getFile()); continue; }
        } catch { /* el archivo se movió o se borró */ }
      }
      if (i !== undefined || list.length === 1) {
        const got = await pickVideo();
        if (!got) return;
        if (got.file.name !== s.name || got.file.size !== s.size) say(`Elegiste “${got.file.name}”, pero el proyecto usa “${s.name}”. Revisa que los cortes coincidan.`, true);
        await attach(k, got.file, got.handle);
      }
    }
  }
  const ready = !!p && p.sources.length > 0 && p.sources.every((_, k) => files[k]);
  useEffect(() => { if (ready) setStarted(true); }, [ready]);

  // ---------- Línea de tiempo ----------
  type Placed = Clip & { g: number; ei: number; ci: number };
  const layout = useMemo(() => {
    const clips: Placed[] = [];
    const eps: { g: number; d: number }[] = [];
    let g = 0;
    p?.episodes.forEach((e, ei) => {
      const start = g;
      e.clips.forEach((c, ci) => { clips.push({ ...c, g, ei, ci }); g += len(c); });
      eps.push({ g: start, d: g - start });
    });
    return { clips, eps, total: g };
  }, [p]);
  const total = layout.total;

  const locate = useCallback((g: number) => {
    const list = layout.clips;
    if (!list.length) return null;
    const x = Math.max(0, Math.min(total, g));
    const c = list.find((k) => x >= k.g && x < k.g + len(k)) ?? list[list.length - 1];
    return { ...c, local: Math.min(c.out, c.in + (x - c.g)) };
  }, [layout, total]);

  // Miniaturas por video fuente.
  useEffect(() => {
    if (!started || !p) return;
    const stops: (() => void)[] = [];
    p.sources.forEach((s, i) => {
      if (thumbs[i] || !urls[i]) return;
      let stop = false;
      stops.push(() => { stop = true; });
      const v = document.createElement("video");
      v.src = urls[i]; v.muted = true; v.preload = "auto";
      const step = Math.max(1, s.duration / 150);
      const c = document.createElement("canvas");
      c.width = 96; c.height = 170;
      const ctx = c.getContext("2d");
      (async () => {
        await new Promise((r) => { v.addEventListener("loadeddata", r, { once: true }); v.addEventListener("error", r, { once: true }); });
        const list: string[] = [];
        for (let x = 0; x < s.duration && !stop && v.videoWidth; x += step) {
          v.currentTime = Math.min(x + 0.05, s.duration - 0.05);
          await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
          if (!ctx) break;
          const k = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
          ctx.drawImage(v, (c.width - v.videoWidth * k) / 2, (c.height - v.videoHeight * k) / 2, v.videoWidth * k, v.videoHeight * k);
          list.push(c.toDataURL("image/jpeg", 0.55));
          if (list.length % 10 === 0) setThumbs((th) => ({ ...th, [i]: { step, list: [...list] } }));
        }
        if (!stop) setThumbs((th) => ({ ...th, [i]: { step, list } }));
        v.removeAttribute("src"); v.load();
      })();
    });
    return () => stops.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, urls, p?.sources.length]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [started]);

  const scrollTo = useCallback((g: number) => {
    const el = scroller.current;
    if (!el) return;
    const x = g * pps;
    if (Math.abs(el.scrollLeft - x) < 1) return;
    syncing.current = true;
    el.scrollLeft = x;
  }, [pps]);
  useEffect(() => { scrollTo(tRef.current); }, [pps, width, scrollTo]);

  // Muestra el cuadro del tiempo global g en el video correspondiente.
  const show = useCallback((g: number) => {
    const loc = locate(g);
    tRef.current = Math.max(0, Math.min(total, g));
    setT(tRef.current);
    if (!loc) return;
    if (active.current !== loc.src) { vids.current[active.current]?.pause(); active.current = loc.src; }
    const v = vids.current[loc.src];
    if (v && Math.abs(v.currentTime - loc.local) > 0.03) v.currentTime = loc.local;
  }, [locate, total]);

  function seek(g: number) { pause(); show(g); scrollTo(tRef.current); }

  function pause() { vids.current.forEach((v) => v?.pause()); setPlaying(false); }
  function play() {
    if (!layout.clips.length) return;
    if (tRef.current >= total - 0.05) show(0);
    const loc = locate(tRef.current);
    if (!loc) return;
    active.current = loc.src;
    vids.current[loc.src]?.play().catch(() => {});
    setPlaying(true);
  }
  const toggle = () => (playing ? pause() : play());

  // Reproducción continua a través de clips y videos distintos.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const cur = locate(tRef.current);
      const v = vids.current[active.current];
      if (cur && v) {
        const clip = layout.clips.find((k) => k.ei === cur.ei && k.ci === cur.ci)!;
        let local = v.currentTime;
        if (local >= clip.out - 0.04 || v.ended) {
          const idx = layout.clips.indexOf(clip);
          const next = layout.clips[idx + 1];
          if (!next) { pause(); show(total); scrollTo(total); return; }
          if (next.src !== clip.src || Math.abs(next.in - local) > 0.08) {
            v.pause();
            const nv = vids.current[next.src];
            active.current = next.src;
            if (nv) { nv.currentTime = next.in; nv.play().catch(() => {}); }
          }
          local = next.in;
          tRef.current = next.g + 0.001;
        } else {
          tRef.current = clip.g + Math.max(0, local - clip.in);
        }
        setT(tRef.current);
        scrollTo(tRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, layout]);

  function onScroll() {
    if (syncing.current) { syncing.current = false; return; }
    const el = scroller.current;
    if (!el) return;
    if (playing) pause();
    show(el.scrollLeft / pps);
  }

  // Arrastrar la línea de tiempo con el mouse (en celular ya se desliza con el dedo).
  const dragState = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest(".ed-handle")) return;
    dragState.current = { x: e.clientX, left: scroller.current?.scrollLeft ?? 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragState.current, el = scroller.current;
    if (!d || !el) return;
    if (Math.abs(e.clientX - d.x) > 3) { d.moved = true; setDrag(true); }
    el.scrollLeft = d.left - (e.clientX - d.x);
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = dragState.current;
    dragState.current = null; setDrag(false);
    if (!d || d.moved || !scroller.current) return;
    // Clic sin arrastrar: salta a ese punto.
    const r = scroller.current.getBoundingClientRect();
    seek(tRef.current + (e.clientX - (r.left + r.width / 2)) / pps);
  }

  // ---------- Edición ----------
  const here = locate(t);
  // Mientras se arrastra una orilla, el episodio seleccionado no cambia.
  const cur = trimming ?? (here ? here.ei : -1);

  function splitAt(x: Project, g: number): Project {
    const loc = (() => {
      let acc = 0;
      for (let ei = 0; ei < x.episodes.length; ei++) for (let ci = 0; ci < x.episodes[ei].clips.length; ci++) {
        const c = x.episodes[ei].clips[ci];
        if (g >= acc && g < acc + len(c)) return { ei, ci, local: r2(c.in + (g - acc)), atStart: g - acc < MIN, atEnd: acc + len(c) - g < MIN };
        acc += len(c);
      }
      return null;
    })();
    if (!loc) return x;
    const e = x.episodes[loc.ei];
    let left: Clip[], right: Clip[];
    if (loc.atStart) { if (loc.ci === 0) return x; left = e.clips.slice(0, loc.ci); right = e.clips.slice(loc.ci); }
    else if (loc.atEnd) { if (loc.ci === e.clips.length - 1) return x; left = e.clips.slice(0, loc.ci + 1); right = e.clips.slice(loc.ci + 1); }
    else {
      const c = e.clips[loc.ci];
      left = [...e.clips.slice(0, loc.ci), { ...c, out: loc.local }];
      right = [{ ...c, in: loc.local }, ...e.clips.slice(loc.ci + 1)];
    }
    const eps = [...x.episodes];
    eps.splice(loc.ei, 1, { ...e, clips: left }, { key: uid(), clips: right, title: "" });
    return { ...x, episodes: eps };
  }
  function split() {
    if (!p) return;
    const next = splitAt(p, t);
    if (next === p) return say("Muy cerca del borde de un episodio.", true);
    setMsg(null); commit(() => next);
  }
  function remove() {
    if (cur < 0) return;
    commit((x) => ({ ...x, episodes: x.episodes.filter((_, i) => i !== cur) }));
  }
  function merge() {
    if (cur <= 0) return;
    commit((x) => {
      const eps = [...x.episodes];
      const a = eps[cur - 1], b = eps[cur];
      const clips = [...a.clips];
      for (const c of b.clips) {
        const last = clips[clips.length - 1];
        if (last && last.src === c.src && Math.abs(last.out - c.in) < 0.02) clips[clips.length - 1] = { ...last, out: c.out };
        else clips.push(c);
      }
      eps.splice(cur - 1, 2, { ...a, clips, title: a.title || b.title });
      return { ...x, episodes: eps };
    });
  }
  // Recorta el episodio actual desde/hasta el cursor.
  function trimHere(side: "in" | "out") {
    if (!here || !p) return;
    const e = p.episodes[here.ei];
    const at = r2(here.local);
    if (side === "in") {
      if (len({ ...e.clips[here.ci], in: at }) < MIN) return;
      commit((x) => { const eps = [...x.episodes]; eps[here.ei] = { ...e, clips: [{ ...e.clips[here.ci], in: at }, ...e.clips.slice(here.ci + 1)] }; return { ...x, episodes: eps }; });
      seek(layout.eps[here.ei].g);
    } else {
      if (len({ ...e.clips[here.ci], out: at }) < MIN) return;
      commit((x) => { const eps = [...x.episodes]; eps[here.ei] = { ...e, clips: [...e.clips.slice(0, here.ci), { ...e.clips[here.ci], out: at }] }; return { ...x, episodes: eps }; });
    }
  }
  async function insert() {
    if (!p) return;
    const got = await pickVideo();
    if (!got) return;
    try {
      const duration = await videoDuration(got.file);
      const src: Source = { name: got.file.name, size: got.file.size, duration };
      if (got.handle) await idb("readwrite", (s) => s.put(got.handle, handleKey(src)));
      const si = p.sources.length;
      setFiles((f) => { const n = [...f]; n[si] = got.file; return n; });
      setUrls((u) => [...u, URL.createObjectURL(got.file)]);
      const clip: Clip = { src: si, in: 0, out: r2(duration) };
      commit((x) => {
        const y = { ...x, sources: [...x.sources, src] };
        if (!y.episodes.length) return { ...y, episodes: [{ key: uid(), clips: [clip], title: "" }] };
        // Se inserta dentro del episodio actual, en el cursor.
        const s2 = splitAt(y, t);
        if (s2 === y) {
          const loc = locate(t);
          const ei = loc ? loc.ei : y.episodes.length - 1;
          const e = y.episodes[ei];
          const atStart = loc && t - layout.eps[ei].g < MIN;
          const eps = [...y.episodes];
          eps[ei] = { ...e, clips: atStart ? [clip, ...e.clips] : [...e.clips, clip] };
          return { ...y, episodes: eps };
        }
        const ei = s2.episodes.findIndex((e) => !y.episodes.some((o) => o.key === e.key));
        const eps = [...s2.episodes];
        const a = eps[ei - 1], b = eps[ei];
        eps.splice(ei - 1, 2, { ...a, clips: [...a.clips, clip, ...b.clips] });
        return { ...s2, episodes: eps };
      });
      say(`Insertado “${got.file.name}”. Usa Dividir si quieres que sea un episodio aparte.`);
    } catch (e) { say((e as Error).message, true); }
  }
  function autoSplit() {
    if (!p) return;
    const step = Math.max(5, every);
    commit((x) => {
      let y: Project = { ...x, episodes: [{ key: uid(), clips: x.episodes.flatMap((e) => e.clips), title: "" }] };
      for (let g = step; g < total - MIN; g += step) y = splitAt(y, g);
      return y;
    });
  }

  // Arrastrar las orillas del episodio seleccionado para recortarlo.
  const trimDrag = useRef<{ side: "in" | "out"; x: number; ei: number; base: Clip; ci: number; snapped: string } | null>(null);
  function handleDown(e: React.PointerEvent, side: "in" | "out") {
    if (!p || cur < 0) return;
    e.stopPropagation(); e.preventDefault();
    pause();
    const ep = p.episodes[cur];
    const ci = side === "in" ? 0 : ep.clips.length - 1;
    trimDrag.current = { side, x: e.clientX, ei: cur, base: ep.clips[ci], ci, snapped: snap(p) };
    setTrimming(cur);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handleMove(e: React.PointerEvent) {
    const d = trimDrag.current;
    if (!d || !p) return;
    const ds = (e.clientX - d.x) / pps;
    const max = p.sources[d.base.src].duration;
    const c = d.side === "in"
      ? { ...d.base, in: r2(Math.max(0, Math.min(d.base.out - MIN, d.base.in + ds))) }
      : { ...d.base, out: r2(Math.min(max, Math.max(d.base.in + MIN, d.base.out + ds))) };
    setP((x) => {
      if (!x) return x;
      const eps = [...x.episodes];
      const clips = [...eps[d.ei].clips];
      clips[d.ci] = c;
      eps[d.ei] = { ...eps[d.ei], clips };
      return { ...x, episodes: eps };
    });
    // Muestra el cuadro de la orilla que se mueve.
    const v = vids.current[c.src];
    if (v) { active.current = c.src; v.currentTime = d.side === "in" ? c.in : Math.max(c.in, c.out - 0.05); }
  }
  function handleUp() {
    const d = trimDrag.current;
    trimDrag.current = null;
    setTrimming(null);
    if (!d || !p) return;
    if (d.snapped !== snap(p)) setHist((h) => ({ undo: [...h.undo.slice(-99), d.snapped], redo: [] }));
    const g = layout.eps[d.ei]?.g ?? 0;
    seek(d.side === "in" ? g : g + (layout.eps[d.ei]?.d ?? 0) - 0.05);
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!ready || busy || confirm || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === " ") { e.preventDefault(); toggle(); }
      else if (k === "s" || k === "c") { e.preventDefault(); split(); }
      else if (k === "delete" || k === "backspace") { e.preventDefault(); remove(); }
      else if (k === "i") { e.preventDefault(); trimHere("in"); }
      else if (k === "o") { e.preventDefault(); trimHere("out"); }
      else if (k === "arrowleft") { e.preventDefault(); seek(tRef.current - (e.shiftKey ? 1 : 0.1)); }
      else if (k === "arrowright") { e.preventDefault(); seek(tRef.current + (e.shiftKey ? 1 : 0.1)); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---------- Estado de cada episodio y guardado ----------
  const byNumber = useMemo(() => new Map(episodes.map((e) => [e.number, e])), [episodes]);
  const rows = useMemo(() => (p?.episodes ?? []).map((e, i) => {
    const number = p!.first + i;
    const old = p!.uploaded[sig(e, p!.sources)];
    const exists = old !== undefined && byNumber.get(old)?.hasVideo;
    const status: Status = exists ? (old === number ? "ok" : "move") : "new";
    return { e, number, status, oldNumber: exists ? old : undefined };
  }), [p, byNumber]);

  const used = new Set(rows.map((r) => r.number));
  const reusedOld = new Set(rows.filter((r) => r.oldNumber !== undefined).map((r) => r.oldNumber!));
  const tracked = p ? [...new Set(Object.values(p.uploaded))] : [];
  const toDelete = tracked.filter((n) => !reusedOld.has(n) && !used.has(n) && byNumber.has(n)).sort((a, b) => a - b);
  const toUpload = rows.filter((r) => r.status === "new");
  const toMove = rows.filter((r) => r.status === "move");
  const replacing = toUpload.filter((r) => byNumber.get(r.number)?.hasVideo).map((r) => r.number);
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

  async function render(f: FFmpeg, e: Ep, label: string) {
    const prog = (what: string) => ({ progress }: { progress: number }) =>
      setBusy(`${what} ${label}… ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`);
    const run = async (what: string, args: string[]) => {
      const on = prog(what);
      f.on("progress", on);
      const code = await f.exec(args);
      f.off("progress", on);
      return code;
    };
    // 1. Corta cada clip sin recomprimir.
    const parts: string[] = [];
    for (let i = 0; i < e.clips.length; i++) {
      const c = e.clips[i];
      setBusy(`Cortando ${label}…`);
      const code = await run("Cortando", [
        "-ss", c.in.toFixed(2), "-i", `/in/s${c.src}`, "-t", len(c).toFixed(2),
        "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", `part${i}.mp4`,
      ]);
      if (code !== 0) throw new Error(`No se pudo cortar el ${label}.`);
      parts.push(`part${i}.mp4`);
    }
    // 2. Si son varios clips, se juntan (si los videos no son compatibles, se recomprimen).
    let out = parts[0];
    if (parts.length > 1) {
      await f.writeFile("list.txt", parts.map((x) => `file '${x}'`).join("\n"));
      let code = await run("Uniendo", ["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "joined.mp4"]);
      if (code !== 0) {
        code = await run("Uniendo", [
          ...parts.flatMap((x) => ["-i", x]),
          "-filter_complex", parts.map((_, i) => `[${i}:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];[${i}:a:0]aresample=44100[a${i}];`).join("") + parts.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${parts.length}:v=1:a=1[v][a]`,
          "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "joined.mp4",
        ]);
        if (code !== 0) throw new Error(`No se pudieron unir los videos del ${label}. Revisa que todos tengan audio y sean MP4.`);
      }
      for (const x of parts) await f.deleteFile(x);
      await f.deleteFile("list.txt").catch(() => {});
      out = "joined.mp4";
    }
    let data = (await f.readFile(out)) as Uint8Array;
    await f.deleteFile(out);
    // 3. Demasiado pesado para el almacenamiento: se comprime a 720p con la tasa justa.
    if (data.byteLength > LIMIT) {
      const kbps = Math.max(400, Math.floor((TARGET * 8) / epLen(e) / 1000) - 128);
      await f.writeFile("big.mp4", data);
      const code = await run(`Comprimiendo (pesaba ${(data.byteLength / MB).toFixed(0)} MB)`, [
        "-i", "big.mp4", "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "small.mp4",
      ]);
      await f.deleteFile("big.mp4");
      if (code !== 0) throw new Error(`No se pudo comprimir el ${label}.`);
      data = (await f.readFile("small.mp4")) as Uint8Array;
      await f.deleteFile("small.mp4");
      if (data.byteLength > 50 * MB) throw new Error(`El ${label} sigue pesando más de 50 MB. Divídelo en partes más cortas.`);
    }
    return new File([data as BlobPart], `${label.replace(/\W+/g, "-")}.mp4`, { type: "video/mp4" });
  }

  async function save(markOnly = false) {
    if (!p) return;
    setConfirm(null); setMsg(null);
    const title = (r: (typeof rows)[number]) => r.e.title.trim() || `Episodio ${r.number}`;
    let proj: Project = { ...p };
    try {
      if (markOnly) {
        const uploaded: Record<string, number> = {};
        for (const r of rows) uploaded[sig(r.e, p.sources)] = r.number;
        proj = { ...proj, uploaded };
      } else {
        for (const n of toDelete) {
          setBusy(`Borrando episodio ${n}…`);
          const ep = byNumber.get(n);
          if (ep) await fetch(`/api/admin/episodes?id=${ep.id}`, { method: "DELETE" });
        }
        if (toMove.length) {
          setBusy("Reordenando episodios…");
          const r = await fetch("/api/admin/episodes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "renumber", seriesId, moves: toMove.map((x) => ({ from: x.oldNumber, to: x.number })) }),
          });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudieron reordenar los episodios.");
        }
        const uploaded: Record<string, number> = {};
        for (const r of rows) if (r.status !== "new") uploaded[sig(r.e, p.sources)] = r.number;
        proj = { ...proj, uploaded };
        await persist(proj);
        for (const r of rows.filter((x) => x.status !== "new")) {
          const before = byNumber.get(r.oldNumber ?? r.number)?.title;
          if (before !== title(r)) await saveEpisodeApi({ seriesId, number: r.number, title: title(r) });
        }
        if (toUpload.length) {
          setBusy("Preparando el editor (la primera vez descarga ~30 MB)…");
          const f = await loadFFmpeg();
          const { FFFSType } = await import("@ffmpeg/ffmpeg");
          await f.createDir("/in").catch(() => {});
          // Nombres fijos por fuente para que no choquen archivos con el mismo nombre.
          await f.mount(FFFSType.WORKERFS, { files: files.map((x, i) => new File([x!], `s${i}`)) }, "/in");
          try {
            for (let i = 0; i < toUpload.length; i++) {
              const r = toUpload[i];
              const label = `episodio ${r.number} (${i + 1} de ${toUpload.length})`;
              const file = await render(f, r.e, label);
              setBusy(`Subiendo ${label} · ${(file.size / MB).toFixed(1)} MB…`);
              const { path } = await upload("video", file);
              await saveEpisodeApi({ seriesId, number: r.number, title: title(r), videoPath: path, duration: epLen(r.e) });
              proj = { ...proj, uploaded: { ...proj.uploaded, [sig(r.e, p.sources)]: r.number } };
              await persist(proj);
            }
          } finally {
            await f.unmount("/in").catch(() => {});
          }
        }
      }
      await persist(proj);
      setP(proj); setChanged(true); onChanged();
      setBusy("");
      say(markOnly ? "Listo: marcados como subidos." : "Listo: episodios actualizados.");
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

  const track = total * pps;
  const tick = pps >= 40 ? 1 : pps >= 12 ? 5 : pps >= 4 ? 10 : 30;
  const curRow = cur >= 0 ? rows[cur] : undefined;

  return (
    <div className="veil ed-veil" role="dialog" aria-modal="true" aria-label="Editor de episodios">
      <div className="ed">
        <header className="ed-top">
          <button className="btn soft small" onClick={close}>{busy ? "Cancelar" : "✕ Cerrar"}</button>
          <b>Editor de episodios</b>
          {ready ? (
            <button className="btn primary small" disabled={!!busy || !pending}
              onClick={() => (toDelete.length || replacing.length ? setConfirm([...toDelete.map((n) => `Se borrará el episodio ${n}.`), ...(replacing.length ? [`Se reemplazará el video de: ${replacing.join(", ")}.`] : [])]) : save())}>
              {pending ? `Guardar (${pending})` : "Guardado ✓"}
            </button>
          ) : <span />}
        </header>

        {!loaded ? <p className="muted ed-pad">Cargando…</p> : !ready ? (
          <div className="ed-pad ed-start">
            {p && p.sources.length ? (
              <>
                <b>Continuar donde te quedaste</b>
                <span className="muted">{p.episodes.length} episodios en el proyecto. Abre {p.sources.length > 1 ? "los videos" : "el video"}:</span>
                <div className="ed-srcs">
                  {p.sources.map((s, i) => (
                    <div key={i} className="arow">
                      <span className="ainfo"><b>{s.name}</b><small>{(s.size / MB).toFixed(0)} MB · {fmt(s.duration)}</small></span>
                      {files[i] ? <span className="ed-st">✓ Listo</span> : <button className="btn soft small" onClick={() => reopen(i)}>Abrir</button>}
                    </div>
                  ))}
                </div>
                {p.sources.length > 1 && <button className="btn primary" onClick={() => reopen()}>Abrir todos</button>}
                <button className="btn soft small" onClick={startNew}>Empezar de cero con otro video</button>
              </>
            ) : (
              <>
                <b>Elige el video completo de la serie</b>
                <span className="muted">Se corta aquí en tu navegador; solo se suben los episodios. Usa computadora con Chrome o Edge.</span>
                <button className="btn primary" onClick={startNew}>Elegir video</button>
              </>
            )}
            {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
          </div>
        ) : (
          <>
            <div className="ed-stage" onClick={toggle}>
              {urls.map((u, i) => (
                <video key={i} ref={(el) => { vids.current[i] = el; }} src={u} playsInline preload="auto"
                  className="ed-video" style={{ visibility: (here?.src ?? 0) === i ? "visible" : "hidden" }}
                  onLoadedData={() => { if (i === (here?.src ?? 0)) show(tRef.current); }} />
              ))}
              {curRow && <span className={`ed-badge ${curRow.status}`}>Episodio {curRow.number}</span>}
            </div>

            <div className="ed-bar">
              <button className="ed-mini" onClick={undo} disabled={!hist.undo.length || !!busy} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">↶</button>
              <span className="tcode">{fmt(t, true)}</span>
              <button className="ed-play" onClick={toggle} aria-label={playing ? "Pausa" : "Reproducir"}>{playing ? "❚❚" : "▶"}</button>
              <span className="tcode muted">{fmt(total)}</span>
              <button className="ed-mini" onClick={redo} disabled={!hist.redo.length || !!busy} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">↷</button>
            </div>

            <div className="ed-tl">
              <div className={`ed-scroll${drag ? " dragging" : ""}`} ref={scroller} onScroll={onScroll}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragState.current = null; setDrag(false); }}
                onWheel={(e) => {
                  if (e.ctrlKey || e.metaKey) { e.preventDefault(); setPps((z) => Math.min(200, Math.max(2, z * (e.deltaY < 0 ? 1.2 : 0.83)))); }
                  else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scroller.current) scroller.current.scrollLeft += e.deltaY;
                }}>
                <div className="ed-inner" style={{ width: track + width, paddingInline: width / 2 }}>
                  <div className="ed-ruler" style={{ width: track }}>
                    {Array.from({ length: Math.floor(total / tick) + 1 }, (_, i) => (
                      <span key={i} style={{ left: i * tick * pps }}>{fmt(i * tick)}</span>
                    ))}
                  </div>
                  <div className="ed-track" style={{ width: track }}>
                    {layout.clips.map((c) => {
                      const th = thumbs[c.src];
                      return (
                        <div key={`${c.ei}-${c.ci}`} className="ed-clipimg" style={{ left: c.g * pps, width: len(c) * pps }}>
                          {th?.list.map((src, i) => {
                            const at = i * th.step;
                            if (at + th.step < c.in || at > c.out) return null;
                            return <img key={i} src={src} alt="" draggable={false} style={{ left: (at - c.in) * pps, width: Math.max(1, th.step * pps) }} />;
                          })}
                        </div>
                      );
                    })}
                    {rows.map((r, i) => {
                      const L = layout.eps[i];
                      return (
                        <div key={r.e.key} className={`ed-clip ${r.status} ${i === cur ? "sel" : ""}`} style={{ left: L.g * pps, width: Math.max(2, L.d * pps) }}>
                          <small>{r.number}{r.e.clips.length > 1 ? ` · ${r.e.clips.length} clips` : ""}</small>
                          {i === cur && !busy && (
                            <>
                              <span className="ed-handle in" onPointerDown={(e) => handleDown(e, "in")} onPointerMove={handleMove} onPointerUp={handleUp} aria-label="Recortar inicio" />
                              <span className="ed-handle out" onPointerDown={(e) => handleDown(e, "out")} onPointerMove={handleMove} onPointerUp={handleUp} aria-label="Recortar final" />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <i className="ed-head" aria-hidden />
            </div>

            <div className="ed-tools">
              <button onClick={split} disabled={!!busy}><span>✂</span>Dividir</button>
              <button onClick={() => trimHere("in")} disabled={!!busy || cur < 0}><span>⟦</span>Inicio aquí</button>
              <button onClick={() => trimHere("out")} disabled={!!busy || cur < 0}><span>⟧</span>Fin aquí</button>
              <button onClick={merge} disabled={!!busy || cur <= 0}><span>⇤</span>Unir</button>
              <button onClick={insert} disabled={!!busy}><span>＋</span>Insertar</button>
              <button onClick={remove} disabled={!!busy || cur < 0}><span>🗑</span>Eliminar</button>
              <button onClick={() => setPps((z) => Math.max(2, z / 1.5))}><span>−</span>Alejar</button>
              <button onClick={() => setPps((z) => Math.min(200, z * 1.5))}><span>+</span>Acercar</button>
            </div>

            {curRow && (
              <div className="ed-pad ed-info">
                <b className={`epn ${curRow.status === "new" ? "lockd" : ""}`}>{curRow.number}</b>
                <input aria-label={`Título del episodio ${curRow.number}`} placeholder={`Episodio ${curRow.number}`} value={curRow.e.title}
                  onFocus={() => p && setHist((h) => ({ undo: [...h.undo.slice(-99), snap(p)], redo: [] }))}
                  onChange={(e) => setP((x) => x && ({ ...x, episodes: x.episodes.map((k, i) => (i === cur ? { ...k, title: e.target.value } : k)) }))} />
                <span className={`ed-st ${curRow.status}`}>
                  {curRow.status === "ok" ? "✓ Subido" : curRow.status === "move" ? `✓ Subido (era el ${curRow.oldNumber})` : "● Por subir"} · {epLen(curRow.e).toFixed(1)} s
                </span>
              </div>
            )}

            <div className="ed-pad ed-more">
              <div className="ed-chips">
                {rows.map((r, i) => (
                  <button key={r.e.key} className={`ed-chip ${r.status} ${i === cur ? "sel" : ""}`} onClick={() => seek(layout.eps[i].g + 0.01)}>{r.number}</button>
                ))}
              </div>
              <div className="acts" style={{ alignItems: "center" }}>
                <label className="inline">Dividir cada <input type="number" min={5} value={every} onChange={(e) => setEvery(Number(e.target.value))} /> s</label>
                <button className="btn soft small" onClick={autoSplit} disabled={!!busy}>Aplicar</button>
                <label className="inline">Empieza en el episodio <input type="number" min={1} value={p!.first} onChange={(e) => commit((x) => ({ ...x, first: Math.max(1, Number(e.target.value) || 1) }))} /></label>
              </div>
              {toUpload.length > 0 && replacing.length === toUpload.length && !Object.keys(p!.uploaded).length && (
                <p className="muted" style={{ fontSize: 12 }}>
                  ¿Ya subiste estos episodios antes con los mismos cortes?{" "}
                  <button className="linkish" onClick={() => save(true)} disabled={!!busy}>Marcarlos como subidos</button> para no volver a subirlos.
                </p>
              )}
              {(busy || msg) && <p className={`msg${msg?.err && !busy ? " err" : ""}`}>{busy || msg?.text}</p>}
              <p className="muted" style={{ fontSize: 12 }}>
                Arrastra la línea de tiempo (o usa la rueda) para moverte. Arrastra las orillas blancas del episodio para recortarlo.
                Atajos: <b>S</b> dividir · <b>Supr</b> eliminar · <b>I</b>/<b>O</b> inicio/fin aquí · <b>Ctrl+Z</b> deshacer · <b>Ctrl+Y</b> rehacer · <b>espacio</b> reproducir · Ctrl + rueda zoom.
                Tus cambios se guardan solos; “Guardar” sube solo lo nuevo o cambiado.
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
      </div>
    </div>
  );
}
