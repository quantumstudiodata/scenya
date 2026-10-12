"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Msg = { text: string; err?: boolean } | null;

// Invitado → cuenta con correo. Supabase manda un correo de confirmación;
// el enlace regresa a /cuenta, donde ya puede crear su contraseña.
export function SaveGuestAccount() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/cuenta` }
    );
    setLoading(false);
    setMsg(error
      ? { text: "No se pudo guardar. Revisa el correo o usa otro.", err: true }
      : { text: "Te enviamos un correo. Ábrelo para confirmar y luego crea tu contraseña." });
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label htmlFor="save-email">
        Correo
        <input id="save-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
      <button className="btn primary block" disabled={loading}>{loading ? "Guardando…" : "Guardar mi cuenta"}</button>
    </form>
  );
}

export function SetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    setPassword("");
    setMsg(error
      ? { text: "No se pudo guardar la contraseña. Usa al menos 6 caracteres.", err: true }
      : { text: "Contraseña guardada." });
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label htmlFor="new-password">
        Nueva contraseña
        <input id="new-password" type="password" required minLength={6} autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
      <button className="btn ghost block" disabled={loading}>{loading ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
