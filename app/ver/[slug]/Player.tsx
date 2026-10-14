"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Episode } from "@/lib/catalog";
import { ensureSession } from "@/lib/session-client";
import { saveWatch } from "@/lib/watch";
import { shareLink } from "@/components/ShareButton";
import { Back, Up, Down, Close, Heart, Chat, Share, List, Lock, Check, Send, Play } from "@/components/Icons";
import PayModal from "./PayModal";

type Info = { locked: boolean; videoUrl: string | null; likes: number; liked: boolean; comments: number };
type Comment = { id: string; author_name: string; body: string; created_at: string };
type Modal = null | "locked" | "pay" | "done";

const RANGE = 30;
const fmt = (n: number) => new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);

export default function Player({
  series,
  episodes,
  startEp,
  free,
  initialSubscribed,
  publishableKey,
}: {
  series: { slug: string; title: string; synopsis: string; poster: string | null; className: string };
  episodes: Episode[];
  startEp: number;
  free: number;
  initialSubscribed: boolean;
  publishableKey?: string;
}) {
  const router = useRouter();
  const total = episodes.length;
  const [cur, setCur] = useState(startEp);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [info, setInfo] = useState<Info | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null); // 0–1 mientras se arrastra la barra
  const [skipFx, setSkipFx] = useState<{ dir: -1 | 1; n: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideTab, setSideTab] = useState<"eps" | "comments">("eps");
  const [range, setRange] = useState(Math.floor((startEp - 1) / RANGE));
  const [modal, setModal] = useState<Modal>(null);
  const [plan, setPlan] = useState<"mensual" | "anual">("anual");
  const [target, setTarget] = useState<number | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wheelLock = useRef(0);
  const touchY = useRef<number | null>(null);

  const episode = episodes[cur - 1];
  const isLocked = useCallback((n: number) => n > free && !subscribed, [free, subscribed]);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1700); };

  // La lista de episodios se abre sola al entrar (en teléfono; en escritorio siempre está visible).
  useEffect(() => { const t = setTimeout(() => setSideOpen(true), 500); return () => clearTimeout(t); }, []);

  // Carga del episodio actual
  useEffect(() => {
    if (!episode) return;
    let alive = true;
    setInfo(null);
    setProgress(0);
    setComments(null);
    window.history.replaceState(null, "", `/ver/${series.slug}?ep=${cur}`);
    saveWatch({ slug: series.slug, title: series.title, ep: cur, total, className: series.className, poster: series.poster });
    fetch(`/api/episodes/${episode.id}`)
      .then((r) => r.json())
      .then((d: Info) => {
        if (!alive) return;
        setInfo(d);
        if (d.locked) { setTarget(cur); setModal("locked"); }
      })
      .catch(() => alive && flash("No se pudo cargar el episodio"));
    return () => { alive = false; };
  }, [cur, episode, series, total, subscribed]);

  // Pausa el video mientras hay una ventana abierta
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (modal || paused) v.pause();
    else v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => setPaused(true)); });
  }, [modal, paused, info]);

  const go = useCallback((n: number) => {
    if (n < 1 || n > total || n === cur) return;
    setDir(n > cur ? "up" : "down");
    setPaused(false);
    setRange(Math.floor((n - 1) / RANGE));
    if (isLocked(n)) { setTarget(n); setModal("locked"); return; }
    setCur(n);
  }, [cur, total, isLocked]);

  // Teclado y rueda: ↑ ↓ como deslizar en el teléfono
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "ArrowDown") { e.preventDefault(); go(cur + 1); }
      if (e.key === "ArrowUp") { e.preventDefault(); go(cur - 1); }
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      if (e.key === "ArrowRight") { e.preventDefault(); skip(5); }
      if (e.key === "ArrowLeft") { e.preventDefault(); skip(-5); }
      if (e.key === "Escape") setSideOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, cur, modal]);

  // Adelantar / regresar
  function skip(sec: number) {
    const v = video.current;
    if (!v || !v.duration) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.1, v.currentTime + sec));
    setProgress((v.currentTime / v.duration) * 100);
    const dir = sec > 0 ? 1 : -1;
    setSkipFx((f) => ({ dir, n: f?.dir === dir ? f.n + 1 : 1 }));
  }
  useEffect(() => {
    if (!skipFx) return;
    const id = setTimeout(() => setSkipFx(null), 650);
    return () => clearTimeout(id);
  }, [skipFx]);

  // Un toque pausa; doble toque en la orilla izquierda/derecha regresa/adelanta 5 s.
  function onVideoTap(e: React.MouseEvent<HTMLVideoElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = null;
      if (x < 0.4) skip(-5); else if (x > 0.6) skip(5); else setPaused((p) => !p);
      return;
    }
    tapTimer.current = setTimeout(() => { tapTimer.current = null; setPaused((p) => !p); }, 260);
  }

  // Barra de progreso: tocar o arrastrar para moverse en el episodio.
  function scrubAt(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }
  function scrubEnd(frac: number) {
    const v = video.current;
    if (v?.duration) { v.currentTime = frac * v.duration; setProgress(frac * 100); }
    setScrub(null);
  }
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function onWheel(e: React.WheelEvent) {
    if (modal || Math.abs(e.deltaY) < 30 || Date.now() - wheelLock.current < 700) return;
    wheelLock.current = Date.now();
    go(cur + (e.deltaY > 0 ? 1 : -1));
  }

  async function like() {
    if (!episode || !info) return;
    await ensureSession();
    setInfo({ ...info, liked: !info.liked, likes: info.likes + (info.liked ? -1 : 1) });
    const r = await fetch(`/api/episodes/${episode.id}/like`, { method: "POST" });
    if (r.ok) { const d = await r.json(); setInfo((i) => (i ? { ...i, liked: d.liked, likes: d.likes } : i)); }
  }

  async function openComments() {
    setSideTab("comments");
    setSideOpen(true);
    if (comments || !episode) return;
    const d = await fetch(`/api/episodes/${episode.id}/comments`).then((r) => r.json()).catch(() => ({ comments: [] }));
    setComments(d.comments);
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !episode) return;
    setDraft("");
    await ensureSession();
    const r = await fetch(`/api/episodes/${episode.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash(d.error ?? "No se pudo publicar");
    setComments((c) => [{ ...d.comment, id: d.comment.id }, ...(c ?? [])]);
    setInfo((i) => (i ? { ...i, comments: i.comments + 1 } : i));
  }

  async function share() {
    const t = await shareLink(series.title, `/ver/${series.slug}?ep=${cur}`);
    if (t) flash(t);
  }

  const onPaid = useCallback(async (sessionId: string) => {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      const d = await fetch("/api/checkout/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }),
      }).then((r) => r.json()).catch(() => ({}));
      ok = !!d.subscribed;
      if (!ok) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!ok) { setModal(null); flash("Pago recibido. Tu acceso se activa en unos segundos."); return; }
    setSubscribed(true);
    setModal("done");
    setSideTab("eps");
    setSideOpen(true);
    setUnlocking(true);
    setTimeout(() => setUnlocking(false), 2600);
    router.refresh();
  }, [router]);

  function continueWatching() {
    setModal(null);
    setPaused(false);
    // Al cambiar "subscribed" el episodio actual se vuelve a cargar ya desbloqueado.
    if (target && target !== cur) setCur(target);
  }

  const rangeCount = Math.ceil(total / RANGE);
  const shown = episodes.slice(range * RANGE, range * RANGE + RANGE);
  const lockedNow = info?.locked ?? false;
  const bgClass = series.poster ? "" : series.className;
  const bgStyle = series.poster ? { backgroundImage: `url(${series.poster})` } : undefined;
  let unlockIndex = 0;

  return (
    <div className="player">
      <div className="stage" onWheel={onWheel}>
        <div className={`bg ${bgClass}`} style={bgStyle} />
        <div className="vtop">
          <Link className="round" href={`/serie/${series.slug}`} aria-label="Volver a la serie"><Back /></Link>
          <div><b>{series.title}</b><br /><small className="muted">Episodio {cur} / {total}</small></div>
        </div>

        <div
          key={cur}
          className={`vframe ${dir === "up" ? "slide-up" : dir === "down" ? "slide-down" : ""}`}
          onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (touchY.current === null) return;
            const dy = touchY.current - e.changedTouches[0].clientY;
            touchY.current = null;
            if (Math.abs(dy) > 70) go(cur + (dy > 0 ? 1 : -1));
          }}
        >
          <div className={`poster-fill ${bgClass}`} style={bgStyle} />
          {info?.videoUrl && (
            <video
              ref={video}
              src={info.videoUrl}
              playsInline
              autoPlay
              muted={muted}
              onClick={onVideoTap}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress((v.currentTime / v.duration) * 100);
              }}
              onEnded={() => go(cur + 1)}
            />
          )}
          <div className="shade" />
          {lockedNow && (
            <div className="lockview">
              <div><Lock /><b>Episodio {cur} bloqueado</b><p className="muted" style={{ margin: "6px 0 14px" }}>Desbloquea todos los episodios con Acceso Total.</p>
                <button className="btn primary" onClick={() => { setTarget(cur); setModal("locked"); }}>Desbloquear todo</button></div>
            </div>
          )}
          {paused && !modal && info?.videoUrl && <span className="pausei"><Play /></span>}
          {muted && !paused && (
            <button className="btn soft" style={{ position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 3, padding: "7px 14px" }}
              onClick={() => { setMuted(false); if (video.current) video.current.muted = false; }}>🔇 Toca para activar el sonido</button>
          )}
          <div className="vinfo"><b>{series.title}</b><span>{episode?.title && episode.title !== `Episodio ${cur}` ? episode.title : series.synopsis}</span></div>
          {skipFx && <span key={`${skipFx.dir}${skipFx.n}`} className={`skipfx ${skipFx.dir > 0 ? "fwd" : "back"}`}>{skipFx.dir > 0 ? "»" : "«"} {skipFx.n * 5} s</span>}
          <div
            className={`vbar seek${scrub !== null ? " on" : ""}`}
            role="slider" aria-label="Progreso del episodio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
            onPointerDown={(e) => { if (!info?.videoUrl) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setScrub(scrubAt(e)); }}
            onPointerMove={(e) => { if (scrub !== null) setScrub(scrubAt(e)); }}
            onPointerUp={(e) => { if (scrub !== null) scrubEnd(scrubAt(e)); }}
            onPointerCancel={() => setScrub(null)}
            onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="track"><i style={{ width: `${scrub !== null ? scrub * 100 : progress}%` }} /><b style={{ left: `${scrub !== null ? scrub * 100 : progress}%` }} /></div>
            {scrub !== null && video.current?.duration ? <span className="scrubtime">{clock(scrub * video.current.duration)} / {clock(video.current.duration)}</span> : null}
          </div>
          <button className="epbar" onClick={() => { setSideTab("eps"); setSideOpen(true); }}>
            <span><List className="" /> Episodios 1–{total} · <b style={{ color: "var(--cyan)" }}>{subscribed ? "todo desbloqueado" : `${free} gratis`}</b></span>
            <Up />
          </button>
        </div>

        <div className="rail">
          <button className={info?.liked ? "liked" : ""} onClick={like} aria-label="Me gusta" aria-pressed={!!info?.liked}>
            <span className="ib"><Heart /></span>{fmt(info?.likes ?? 0)}
          </button>
          <button onClick={openComments} aria-label="Comentarios"><span className="ib"><Chat /></span>{fmt(info?.comments ?? 0)}</button>
          <button onClick={share} aria-label="Compartir"><span className="ib"><Share /></span>Compartir</button>
          <button onClick={() => { setSideTab("eps"); setSideOpen(true); }} aria-label="Episodios"><span className="ib"><List /></span>Episodios</button>
        </div>

        <div className="updown">
          <button onClick={() => go(cur - 1)} disabled={cur <= 1} aria-label="Episodio anterior"><Up /></button>
          <button onClick={() => go(cur + 1)} disabled={cur >= total} aria-label="Siguiente episodio"><Down /></button>
        </div>
      </div>

      {sideOpen && <div className="sheet-veil" onClick={() => setSideOpen(false)} />}
      <aside className="side" data-open={sideOpen}>
        <button className="x" onClick={() => setSideOpen(false)} aria-label="Cerrar"><Close /></button>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={sideTab === "eps"} onClick={() => setSideTab("eps")}>Episodios</button>
          <button role="tab" aria-selected={sideTab === "comments"} onClick={openComments}>Comentarios</button>
        </div>
        {sideTab === "eps" ? (
          <div className="body">
            {rangeCount > 1 && (
              <div className="ranges">
                {Array.from({ length: rangeCount }, (_, i) => (
                  <button key={i} aria-pressed={range === i} onClick={() => setRange(i)}>
                    {i * RANGE + 1}–{Math.min((i + 1) * RANGE, total)}
                  </button>
                ))}
              </div>
            )}
            <div className="legend">
              <span><i style={{ background: "var(--cyan)" }} />Gratis</span>
              {!subscribed && <span><i style={{ background: "var(--lav-dim)" }} />Acceso Total</span>}
            </div>
            <div className="epg">
              {shown.map((e) => {
                const locked = isLocked(e.number);
                const anim = unlocking && e.number > free;
                const cls = e.number === cur ? "cur" : locked ? "lock" : "free";
                return (
                  <button
                    key={e.id}
                    className={`ep ${cls}${e.number < cur ? " seen" : ""}${anim ? " unlocking" : ""}`}
                    style={anim ? ({ "--d": `${(unlockIndex++) * 45}ms` } as React.CSSProperties) : undefined}
                    onClick={() => { go(e.number); if (window.innerWidth <= 900 && !isLocked(e.number)) setSideOpen(false); }}
                    aria-label={`Episodio ${e.number}${locked ? " (bloqueado)" : ""}`}
                  >
                    {e.number}
                    {(locked || anim) && <Lock className="lk" />}
                  </button>
                );
              })}
            </div>
            {!subscribed && (
              <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => { setTarget(free + 1); setModal("locked"); }}>
                Desbloquear los {total} episodios
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="body">
              {comments === null ? <p className="muted">Cargando…</p> : comments.length === 0 ? (
                <p className="muted">Sé la primera persona en comentar este episodio.</p>
              ) : comments.map((c, i) => (
                <div className={`comment${i === 0 ? " new" : ""}`} key={c.id}>
                  <span className="av">{initials(c.author_name)}</span>
                  <div><b>{c.author_name}</b><p>{c.body}</p></div>
                </div>
              ))}
            </div>
            <form className="cform" onSubmit={postComment}>
              <input id="comment-input" placeholder="Escribe un comentario…" maxLength={300} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
              <button aria-label="Enviar"><Send /></button>
            </form>
          </>
        )}
      </aside>

      {modal && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget && modal !== "pay") setModal(null); }}>
          {modal === "locked" && (
            <div className="modal" role="dialog" aria-label="Episodio bloqueado">
              <button className="x" onClick={() => setModal(null)} aria-label="Cerrar"><Close /></button>
              <div className="ico"><Lock /></div>
              <h3>El episodio {target ?? free + 1} es solo para Acceso Total</h3>
              <p>Desbloquea los {total} episodios y todo el catálogo de Scenya.</p>
              <button className="plan" aria-pressed={plan === "mensual"} onClick={() => setPlan("mensual")}>
                <span><b>Mensual</b><small>Se renueva cada mes</small></span><span className="pr">$99<small> MXN</small></span>
              </button>
              <button className="plan" aria-pressed={plan === "anual"} onClick={() => setPlan("anual")}>
                <span><b>Anual</b><small>Equivale a $83 al mes</small></span><span className="save">AHORRAS $189</span>
                <span className="pr">$999<small> MXN</small></span>
              </button>
              <button className="btn primary block" onClick={() => setModal("pay")}>Desbloquear todo</button>
              <button className="tlink" onClick={() => { setModal(null); if (cur > free && !subscribed) go(free); }}>Seguir viendo episodios gratis</button>
            </div>
          )}
          {modal === "pay" && (
            <PayModal plan={plan} publishableKey={publishableKey} onClose={() => setModal("locked")} onPaid={onPaid} />
          )}
          {modal === "done" && (
            <div className="modal done" role="dialog" aria-label="Episodios desbloqueados">
              <Confetti />
              <div className="ico"><Check /></div>
              <h3>¡Desbloqueaste todos los episodios!</h3>
              <p>Ya tienes Acceso Total. Sigue viendo donde te quedaste.</p>
              <button className="btn primary block" onClick={continueWatching}><Play />Continuar episodio {target ?? cur}</button>
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Confetti() {
  const colors = ["#7c5cff", "#35e0ff", "#ff4fd8", "#ffcf5c", "#ece9ff"];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % 5], animationDelay: `${(i % 7) * 0.08}s` }} />
      ))}
    </div>
  );
}
