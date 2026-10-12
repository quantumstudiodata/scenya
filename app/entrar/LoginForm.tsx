"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/safe-next";

export default function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<"entrar" | "registro">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

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
    setLoading(true);
    setMsg(null);
    const supabase = createClient();

    if (mode === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg({ text: "Correo o contraseña incorrectos.", err: true });
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) {
      setMsg({ text: error.message, err: true });
    } else if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setMsg({ text: "Te enviamos un correo. Ábrelo para confirmar tu cuenta." });
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h1>{mode === "entrar" ? "Entrar" : "Crear cuenta"}</h1>
      <label htmlFor="email">
        Correo
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label htmlFor="password">
        Contraseña
        <input id="password" type="password" required minLength={6}
          autoComplete={mode === "entrar" ? "current-password" : "new-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.text}</p>}
      <button className="btn primary block" disabled={loading}>
        {loading ? "Un momento…" : mode === "entrar" ? "Entrar" : "Crear cuenta"}
      </button>
      <button type="button" className="btn ghost block" onClick={guest} disabled={loading}>
        Continuar como invitado
      </button>
      <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>
        {mode === "entrar" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <button type="button" className="link" onClick={() => { setMode(mode === "entrar" ? "registro" : "entrar"); setMsg(null); }}>
          {mode === "entrar" ? "Crear cuenta" : "Entrar"}
        </button>
      </p>
    </form>
  );
}
