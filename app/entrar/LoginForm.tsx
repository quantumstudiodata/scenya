"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/safe-next";
import { passwordOk } from "@/lib/password";
import PasswordRules from "@/components/PasswordRules";

type Mode = "entrar" | "registro" | "recuperar";

export default function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const go = (m: Mode) => { setMode(m); setMsg(null); setPassword(""); setConfirm(""); };

  async function guest() {
    setLoading(true);
    setMsg(null);
    const { error } = await createClient().auth.signInAnonymously();
    if (error) {
      setMsg({ text: "No se pudo entrar como invitado. Intenta de nuevo.", err: true });
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const supabase = createClient();
    const origin = window.location.origin;

    if (mode === "recuperar") {
      setLoading(true);
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/cuenta/nueva-contrasena`,
      });
      setLoading(false);
      setMsg({ text: "Si ese correo tiene cuenta, te enviamos un enlace para crear una nueva contraseña." });
      return;
    }

    if (mode === "registro") {
      if (!passwordOk(password)) return setMsg({ text: "La contraseña no cumple los requisitos.", err: true });
      if (password !== confirm) return setMsg({ text: "Las contraseñas no coinciden.", err: true });
    }

    setLoading(true);
    if (mode === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        return setMsg({ text: error.message.includes("confirm") ? "Confirma tu correo antes de entrar." : "Correo o contraseña incorrectos.", err: true });
      }
      router.push(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) {
      setMsg({ text: error.message.includes("registered") ? "Ese correo ya tiene una cuenta. Entra con él." : "No se pudo crear la cuenta. Revisa tus datos.", err: true });
    } else if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setMsg({ text: "Te enviamos un correo. Ábrelo para confirmar tu cuenta." });
    }
  }

  const title = mode === "entrar" ? "Entrar" : mode === "registro" ? "Crear cuenta" : "Recuperar contraseña";

  return (
    <form className="panel" onSubmit={submit}>
      <h1>{title}</h1>
      <label htmlFor="email">Correo
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== "recuperar" && (
        <label htmlFor="password">Contraseña
          <input id="password" type="password" required maxLength={64}
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {mode === "registro" && (
        <>
          <PasswordRules value={password} />
          <label htmlFor="confirm">Confirma tu contraseña
            <input id="confirm" type="password" required maxLength={64} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        </>
      )}
      {mode === "entrar" && (
        <button type="button" className="link" style={{ justifySelf: "end", fontSize: 13 }} onClick={() => go("recuperar")}>¿Olvidaste tu contraseña?</button>
      )}
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
      <button className="btn primary block" disabled={loading}>
        {loading ? "Un momento…" : mode === "recuperar" ? "Enviar enlace" : title}
      </button>
      {mode !== "recuperar" && (
        <button type="button" className="btn soft block" onClick={guest} disabled={loading}>Continuar como invitado</button>
      )}
      <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>
        {mode === "entrar" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <button type="button" className="link" onClick={() => go(mode === "entrar" ? "registro" : "entrar")}>
          {mode === "entrar" ? "Crear cuenta" : "Entrar"}
        </button>
      </p>
    </form>
  );
}
