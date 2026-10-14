"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

// Editor para cortar el video completo de una serie en episodios.
// El video se procesa en el navegador (ffmpeg.wasm): no se sube completo,
// solo se suben los episodios ya cortados. El worker de ffmpeg se sirve desde
// public/ffmpeg (copiado de @ffmpeg/ffmpeg) porque webpack rompe su carga dinámica.
const CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
// Límite por archivo de Supabase (plan gratis: 50 MB). Si un episodio pasa
// de LIMIT se vuelve a comprimir para que quepa en TARGET.
const MB = 1048576;
const LIMIT = 48 * MB;
const TARGET = 44 * MB;

const fmt = (s: number) => {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

type Props = {
  startNumber: number;
  onUpload: (number: number, title: string, file: File) => Promise<void>;
  onClose: (changed: boolean) => void;
};

export default function VideoSplitter({ startNumber, onUpload, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [t, setT] = useState(0);
  const [cuts, setCuts] = useState<number[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [trim, setTrim] = useState<{ in: number; out: number | null }>({ in: 0, out: null });
  const [skip, setSkip] = useState<number[]>([]);
  const [first, setFirst] = useState(startNumber);
  const [every, setEvery] = useState(60);
  const [exact, setExact] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const ff = useRef<FFmpeg | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => ff.current?.terminate(), []);

  // Piezas entre los cortes, dentro del recorte; las descartadas no se numeran ni se suben.
  const outPt = trim.out ?? duration;
  const bounds = useMemo(() => [trim.in, ...cuts.filter((c) => c > trim.in && c < outPt), outPt], [cuts, trim.in, outPt]);
  let n = first;
  const pieces = bounds.slice(0, -1).map((start, i) => {
    const skipped = skip.includes(start);
    return { start, end: bounds[i + 1], skipped, number: skipped ? 0 : n++ };
  });
  const segments = pieces.filter((p) => !p.skipped);

  function pick(f: File | undefined) {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setFile(f); setUrl(URL.createObjectURL(f)); setCuts([]); setTitles({}); setTrim({ in: 0, out: null }); setSkip([]); setError(""); setDone(0);
  }

  function seek(s: number) {
    if (!video.current) return;
    video.current.currentTime = Math.max(0, Math.min(duration, s));
  }

  function addCut(at = video.current?.currentTime ?? t) {
    // Sin cortes pegados al inicio, al final o a otro corte (mínimo 1 s).
    if (at < 1 || at > duration - 1 || cuts.some((c) => Math.abs(c - at) < 1)) return;
    setCuts((c) => [...c, Math.round(at * 10) / 10].sort((a, b) => a - b));
  }

  function autoSplit() {
    const step = Math.max(5, every);
    const list: number[] = [];
    for (let s = trim.in + step; s < outPt - 1; s += step) list.push(Math.round(s * 10) / 10);
    setCuts(list); setSkip([]);
  }

  // Recorte del video original: lo de antes del inicio y después del fin no se usa.
  function markIn(at = video.current?.currentTime ?? t) {
    if (at >= outPt - 1) return;
    setTrim((x) => ({ ...x, in: Math.round(at * 10) / 10 }));
  }
  function markOut(at = video.current?.currentTime ?? t) {
    if (at <= trim.in + 1) return;
    setTrim((x) => ({ ...x, out: Math.round(at * 10) / 10 }));
  }

  function removeCut(at: number) {
    setCuts((c) => c.filter((x) => x !== at));
    setSkip((k) => k.filter((x) => x !== at));
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!file || busy || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "c" || e.key === "C") { e.preventDefault(); addCut(); }
      if (e.key === "i" || e.key === "I") { e.preventDefault(); markIn(); }
      if (e.key === "o" || e.key === "O") { e.preventDefault(); markOut(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); seek((video.current?.currentTime ?? 0) - (e.shiftKey ? 1 : 0.1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); seek((video.current?.currentTime ?? 0) + (e.shiftKey ? 1 : 0.1)); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

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

  async function generate() {
    if (!file || !segments.length) return;
    setError(""); setDone(0);
    try {
      setBusy("Preparando el editor (la primera vez descarga ~30 MB)…");
      const f = await loadFFmpeg();
      await f.createDir("/in").catch(() => {});
      const { FFFSType } = await import("@ffmpeg/ffmpeg");
      await f.mount(FFFSType.WORKERFS, { files: [file] }, "/in");
      const input = `/in/${file.name}`;
      try {
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          const label = `episodio ${s.number} (${i + 1} de ${segments.length})`;
          const onProgress = ({ progress }: { progress: number }) =>
            setBusy(`Cortando ${label}… ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`);
          setBusy(`Cortando ${label}…`);
          f.on("progress", onProgress);
          const codec = exact
            ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "128k"]
            : ["-c", "copy", "-avoid_negative_ts", "make_zero"];
          const code = await f.exec([
            "-ss", s.start.toFixed(2), "-i", input, "-t", (s.end - s.start).toFixed(2),
            "-map", "0:v:0", "-map", "0:a:0?", ...codec, "-movflags", "+faststart", "out.mp4",
          ]);
          f.off("progress", onProgress);
          if (code !== 0) throw new Error(`No se pudo cortar el ${label}. Prueba con "Corte exacto".`);
          let data = (await f.readFile("out.mp4")) as Uint8Array;
          await f.deleteFile("out.mp4");
          if (data.byteLength > LIMIT) {
            // Demasiado pesado para el almacenamiento: se comprime a 720p con la tasa justa.
            const secs = s.end - s.start;
            const kbps = Math.max(400, Math.floor((TARGET * 8) / secs / 1000) - 128);
            const big = (data.byteLength / MB).toFixed(0);
            const onZip = ({ progress }: { progress: number }) =>
              setBusy(`Comprimiendo ${label} (pesaba ${big} MB)… ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`);
            setBusy(`Comprimiendo ${label} (pesaba ${big} MB)…`);
            await f.writeFile("big.mp4", data);
            f.on("progress", onZip);
            const zip = await f.exec([
              "-i", "big.mp4", "-map", "0:v:0", "-map", "0:a:0?",
              "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
              "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`,
              "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "small.mp4",
            ]);
            f.off("progress", onZip);
            await f.deleteFile("big.mp4");
            if (zip !== 0) throw new Error(`No se pudo comprimir el ${label}.`);
            data = (await f.readFile("small.mp4")) as Uint8Array;
            await f.deleteFile("small.mp4");
            if (data.byteLength > 50 * MB) throw new Error(`El ${label} sigue pesando más de 50 MB. Córtalo en partes más cortas.`);
          }
          const ep = new File([data as BlobPart], `episodio-${s.number}.mp4`, { type: "video/mp4" });
          setBusy(`Subiendo ${label} · ${(ep.size / MB).toFixed(1)} MB…`);
          await onUpload(s.number, titles[s.start]?.trim() || `Episodio ${s.number}`, ep);
          setDone(i + 1);
        }
      } finally {
        await f.unmount("/in").catch(() => {});
      }
      setBusy("");
      onClose(true);
    } catch (e) {
      console.error(e);
      setBusy("");
      setError((e as Error).message || "Algo falló al generar los episodios.");
    }
  }

  function cancel() {
    if (busy) { ff.current?.terminate(); ff.current = null; setBusy(""); setError("Proceso cancelado."); return; }
    onClose(done > 0);
  }

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label="Editor de episodios">
      <div className="splitter">
        <div className="head">
          <h2>Cortar video completo en episodios</h2>
          <button className="btn soft small" onClick={cancel}>{busy ? "Cancelar" : "Cerrar"}</button>
        </div>

        {!file ? (
          <label className="drop" htmlFor="full-video">
            <b>Elige el video completo de la serie</b>
            <span className="muted">Se corta aquí en tu navegador; solo se suben los episodios. Funciona mejor en computadora (Chrome o Edge).</span>
            <span className="btn primary">Elegir video</span>
            <input id="full-video" type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        ) : (
          <>
            <video
              ref={video} src={url} controls playsInline className="split-video"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            />

            <div
              className="timeline" role="slider" aria-label="Línea de tiempo" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={t} tabIndex={0}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }}
            >
              {duration > 0 && pieces.map((s, i) => (
                <span key={s.start} className={`seg ${i % 2 ? "alt" : ""} ${s.skipped ? "off" : ""}`} style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }}>
                  <small>{s.skipped ? "✕" : s.number}</small>
                </span>
              ))}
              {duration > 0 && trim.in > 0 && <span className="trimmed" style={{ left: 0, width: `${(trim.in / duration) * 100}%` }} />}
              {duration > 0 && outPt < duration && <span className="trimmed" style={{ left: `${(outPt / duration) * 100}%`, right: 0 }} />}
              {duration > 0 && cuts.filter((c) => c > trim.in && c < outPt).map((c) => <i key={c} className="cut" style={{ left: `${(c / duration) * 100}%` }} />)}
              {duration > 0 && <i className="head-pos" style={{ left: `${(t / duration) * 100}%` }} />}
            </div>

            <div className="acts split-tools">
              <button className="btn primary" onClick={() => addCut()} disabled={!!busy}>✂ Cortar aquí <kbd>C</kbd></button>
              <button className="btn soft small" onClick={() => seek(t - 1)}>−1 s</button>
              <button className="btn soft small" onClick={() => seek(t - 0.1)}>−0.1</button>
              <span className="tcode">{fmt(t)} / {fmt(duration)}</span>
              <button className="btn soft small" onClick={() => seek(t + 0.1)}>+0.1</button>
              <button className="btn soft small" onClick={() => seek(t + 1)}>+1 s</button>
            </div>

            <div className="acts split-tools">
              <span className="muted" style={{ fontSize: 13 }}>Recortar el video:</span>
              <button className="btn soft small" onClick={() => markIn()} disabled={!!busy}>⟦ Inicio aquí <kbd>I</kbd></button>
              <button className="btn soft small" onClick={() => markOut()} disabled={!!busy}>Fin aquí ⟧ <kbd>O</kbd></button>
              {(trim.in > 0 || trim.out !== null) && (
                <>
                  <span className="tcode">{fmt(trim.in)} → {fmt(outPt)}</span>
                  <button className="btn soft small danger" onClick={() => setTrim({ in: 0, out: null })} disabled={!!busy}>Quitar recorte</button>
                </>
              )}
            </div>

            <div className="acts split-tools">
              <label className="inline">Dividir cada
                <input type="number" min={5} value={every} onChange={(e) => setEvery(Number(e.target.value))} /> s
              </label>
              <button className="btn soft small" onClick={autoSplit} disabled={!!busy || !duration}>Aplicar</button>
              {cuts.length > 0 && <button className="btn soft small danger" onClick={() => { setCuts([]); setSkip([]); }} disabled={!!busy}>Quitar cortes</button>}
              <label className="inline">Empezar en episodio
                <input type="number" min={1} value={first} onChange={(e) => setFirst(Math.max(1, Number(e.target.value) || 1))} />
              </label>
            </div>

            <div className="alist split-list">
              {pieces.map((s, i) => (
                <div key={s.start} className={`arow ep-row${s.skipped ? " skipped" : ""}`}>
                  <b className="epn">{s.skipped ? "✕" : s.number}</b>
                  {s.skipped ? <span className="muted" style={{ flex: 1 }}>Descartado: no se sube</span> : (
                    <input
                      aria-label={`Título del episodio ${s.number}`} placeholder={`Episodio ${s.number}`}
                      value={titles[s.start] ?? ""} onChange={(e) => setTitles((x) => ({ ...x, [s.start]: e.target.value }))}
                    />
                  )}
                  <button className="btn soft small" onClick={() => { seek(s.start); video.current?.play(); }}>
                    {fmt(s.start)} – {fmt(s.end)} ▶
                  </button>
                  <button className="btn soft small" onClick={() => setSkip((k) => (s.skipped ? k.filter((x) => x !== s.start) : [...k, s.start]))} disabled={!!busy}>
                    {s.skipped ? "Recuperar" : "Descartar"}
                  </button>
                  {i > 0 && (
                    <button className="btn soft small danger" aria-label={`Quitar el corte en ${fmt(s.start)}`} onClick={() => removeCut(s.start)} disabled={!!busy}>
                      Unir con anterior
                    </button>
                  )}
                </div>
              ))}
            </div>

            <label className="check">
              <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} disabled={!!busy} />
              Corte exacto al cuadro (mucho más lento; úsalo si un episodio empieza unos segundos antes)
            </label>

            {(busy || error) && <p className={`msg${error && !busy ? " err" : ""}`}>{busy || error}</p>}

            <div className="acts">
              <button className="btn primary" onClick={generate} disabled={!!busy || !duration || !segments.length}>
                Generar y subir {segments.length} episodio{segments.length === 1 ? "" : "s"}
              </button>
              <label className="btn soft" htmlFor="full-video2">Cambiar video</label>
              <input id="full-video2" type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0])} disabled={!!busy} />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Coloca la reproducción donde termina cada episodio y presiona <b>C</b>. <b>I</b> y <b>O</b> marcan dónde empieza y termina lo que se usa del video. "Descartar" quita una parte (tomas falsas, créditos). Si un episodio pesa más de 48 MB se comprime solo. Flechas ← → mueven 0.1 s (con Shift, 1 s). Si un número de episodio ya existe, su video se reemplaza.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
