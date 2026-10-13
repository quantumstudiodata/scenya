"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Close } from "@/components/Icons";

type Props = { plan: "mensual" | "anual"; until: string | null; canceling: boolean };
type View = "menu" | "cancel" | "annual";

export default function MembershipModal({ plan, until, canceling }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const close = () => { setOpen(false); setView("menu"); setMsg(null); };

  async function act(action: "cancel" | "resume" | "annual", done: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/subscription", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ text: d.error ?? "No se pudo completar el cambio.", err: true });
    setView("menu");
    setMsg({ text: done });
    router.refresh();
  }

  return (
    <>
      <button className="btn soft block" onClick={() => setOpen(true)}>Administrar membresía</button>
      {open && (
        <div className="veil" onClick={(e) => e.target === e.currentTarget && !busy && close()}>
          <div className="modal wide" role="dialog" aria-label="Administrar membresía">
            <button className="x" onClick={close} aria-label="Cerrar" disabled={busy}><Close /></button>
            {view === "menu" && (
              <>
                <h3>Tu membresía</h3>
                <dl className="kv">
                  <dt>Plan</dt><dd>Acceso Total {plan === "anual" ? "anual · $999 MXN" : "mensual · $99 MXN"}</dd>
                  {until && <><dt>{canceling ? "Acceso hasta" : "Próximo cobro"}</dt><dd>{until}</dd></>}
                  <dt>Estado</dt><dd>{canceling ? <span className="pill">Se cancela al terminar el periodo</span> : <span className="pill ok">Activa</span>}</dd>
                </dl>
                {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
                <div className="mopts">
                  {plan === "mensual" && !canceling && (
                    <button className="mopt" onClick={() => setView("annual")}>
                      <b>Cambiar a anual</b><small>$999 MXN al año · ahorras $189</small>
                    </button>
                  )}
                  {canceling ? (
                    <button className="mopt" disabled={busy} onClick={() => act("resume", "¡Listo! Tu membresía sigue activa.")}>
                      <b>Reactivar membresía</b><small>Sigue renovándose como hasta ahora</small>
                    </button>
                  ) : (
                    <button className="mopt danger" onClick={() => setView("cancel")}>
                      <b>Cancelar membresía</b><small>Conservas el acceso hasta el final del periodo</small>
                    </button>
                  )}
                  <form action="/api/portal" method="POST">
                    <button className="mopt"><b>Tarjeta y facturas</b><small>Cambia tu método de pago o descarga facturas</small></button>
                  </form>
                </div>
              </>
            )}
            {view === "cancel" && (
              <>
                <h3>¿Cancelar tu membresía?</h3>
                <p>Seguirás viendo todo el catálogo{until ? ` hasta el ${until}` : ""}. Después ya no se te cobrará.</p>
                {msg && <p className="msg err">{msg.text}</p>}
                <button className="btn soft block danger" disabled={busy} onClick={() => act("cancel", `Membresía cancelada. Conservas el acceso${until ? ` hasta el ${until}` : ""}.`)}>
                  {busy ? "Cancelando…" : "Sí, cancelar"}
                </button>
                <button className="btn primary block" disabled={busy} onClick={() => setView("menu")}>Mejor me quedo</button>
              </>
            )}
            {view === "annual" && (
              <>
                <h3>Cambiar a plan anual</h3>
                <p>Pagas $999 MXN al año en lugar de $1,188. Hoy se cobra la diferencia proporcional a tu tarjeta guardada y el plan anual empieza de inmediato.</p>
                {msg && <p className="msg err">{msg.text}</p>}
                <button className="btn primary block" disabled={busy} onClick={() => act("annual", "¡Listo! Ya tienes el plan anual.")}>
                  {busy ? "Cambiando…" : "Confirmar cambio a anual"}
                </button>
                <button className="btn soft block" disabled={busy} onClick={() => setView("menu")}>Volver</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
