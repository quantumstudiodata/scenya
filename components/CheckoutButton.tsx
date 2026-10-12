"use client";

import { useState } from "react";

export default function CheckoutButton({ plan, children }: { plan: "mensual" | "anual"; children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.status === 401) {
      window.location.href = "/entrar?next=/planes";
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn primary block" onClick={go} disabled={loading}>
        {loading ? "Abriendo pago…" : children}
      </button>
      {error && <p className="msg err" style={{ marginTop: 12 }}>{error}</p>}
    </>
  );
}
