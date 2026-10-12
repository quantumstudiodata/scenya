"use client";

import { useCallback, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { createClient } from "@/lib/supabase/browser";

export default function EmbeddedPay({ plan, publishableKey }: { plan: "mensual" | "anual"; publishableKey?: string }) {
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const [error, setError] = useState("");

  const fetchClientSecret = useCallback(async () => {
    const start = () =>
      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
    let res = await start();
    if (res.status === 401) {
      // Sin sesión: entra como invitado y sigue al pago.
      const { error } = await createClient().auth.signInAnonymously();
      if (error) {
        window.location.href = `/entrar?next=${encodeURIComponent(`/pagar?plan=${plan}`)}`;
        throw error;
      }
      res = await start();
    }
    const data = await res.json().catch(() => ({}));
    if (!data.clientSecret) {
      const msg = data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.";
      setError(msg);
      throw new Error(msg);
    }
    return data.clientSecret as string;
  }, [plan]);

  if (!stripePromise) return <p className="msg err">Los pagos aún no están configurados.</p>;
  if (error) return <p className="msg err">{error}</p>;

  return (
    <div className="checkout">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
