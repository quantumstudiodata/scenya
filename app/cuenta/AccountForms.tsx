"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { passwordOk } from "@/lib/password";
import PasswordRules from "@/components/PasswordRules";

type Msg = { text: string; err?: boolean } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p className={`msg${m.err ? " err" : ""}`}>{m.text}</p> : null);

// Invitado → cuenta con correo. Al confirmar, vuelve aquí para crear su contraseña.
export function SaveGuestAccount() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().auth.updateUser(
      { email, data: { needs_password: true } },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/cuenta` }
    );
    setBusy(false);
    setMsg(error
      ? { text: error.message.includes("registered") ? "Ese correo ya tiene una cuenta. Entra con él." : "No se pudo guardar. Revisa el correo.", err: true }
      : { text: "Te enviamos un correo. Ábrelo para confirmar y luego crea tu contraseña aquí mismo." });
  }
  return (
    <form onSubmit={submit} className="aform-col">
      <label htmlFor="save-email">Correo
        <input id="save-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Note m={msg} />
      <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : "Guardar mi cuenta"}</button>
    </form>
  );
}

export function ChangeEmail({ current }: { current: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === current.toLowerCase()) return setMsg({ text: "Ese ya es tu correo actual.", err: true });
    setBusy(true);
    const { error } = await createClient().auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/cuenta` }
    );
    setBusy(false);
    if (error) return setMsg({ text: error.message.includes("registered") ? "Ese correo ya está en uso." : "No se pudo cambiar el correo.", err: true });
    setEmail("");
    setMsg({ text: `Te enviamos un enlace a ${email}. El cambio se aplica cuando lo abras.` });
  }
  return (
    <form onSubmit={submit} className="aform-col">
      <label htmlFor="new-email">Nuevo correo
        <input id="new-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Note m={msg} />
      <button className="btn soft" disabled={busy || !email}>{busy ? "Enviando…" : "Cambiar correo"}</button>
    </form>
  );
}

export function ChangePassword({ email, needsCurrent }: { email: string; needsCurrent: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordOk(next)) return setMsg({ text: "La nueva contraseña no cumple los requisitos.", err: true });
    if (next !== confirm) return setMsg({ text: "Las contraseñas nuevas no coinciden.", err: true });
    if (needsCurrent && next === current) return setMsg({ text: "La nueva contraseña debe ser diferente a la actual.", err: true });
    setBusy(true);
    const supabase = createClient();
    if (needsCurrent) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: current });
      if (error) { setBusy(false); return setMsg({ text: "Tu contraseña actual no es correcta.", err: true }); }
    }
    const { error } = await supabase.auth.updateUser({ password: next, data: { needs_password: false } });
    setBusy(false);
    if (error) return setMsg({ text: "No se pudo cambiar la contraseña. Intenta de nuevo.", err: true });
    setCurrent(""); setNext(""); setConfirm("");
    setMsg({ text: "Contraseña actualizada." });
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="aform-col">
      {needsCurrent && (
        <label htmlFor="cur-pass">Contraseña actual
          <input id="cur-pass" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      )}
      <label htmlFor="new-pass">Nueva contraseña
        <input id="new-pass" type="password" required autoComplete="new-password" maxLength={64} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <PasswordRules value={next} />
      <label htmlFor="conf-pass">Confirma la nueva contraseña
        <input id="conf-pass" type="password" required autoComplete="new-password" maxLength={64} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <Note m={msg} />
      <button className="btn soft" disabled={busy}>{busy ? "Guardando…" : needsCurrent ? "Cambiar contraseña" : "Crear contraseña"}</button>
    </form>
  );
}
