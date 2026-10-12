"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { ensureSession } from "@/lib/session-client";
import { Close } from "@/components/Icons";

// Pago de Stripe dentro de una ventana, sin salir del video.
export default function PayModal({
  plan,
  publishableKey,
  onClose,
  onPaid,
}: {
  plan: "mensual" | "anual";
  publishableKey?: string;
  onClose: () => void;
  onPaid: (sessionId: string) => void;
}) {
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const sessionId = useRef("");
  const [error, setError] = useState("");

  const fetchClientSecret = useCallback(async () => {
    await ensureSession();
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, inline: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.clientSecret) {
      setError(data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.");
      throw new Error("checkout");
    }
    sessionId.current = data.sessionId;
    return data.clientSecret as string;
  }, [plan]);

  const paid = useRef(onPaid);
  paid.current = onPaid;
  const options = useMemo(
    () => ({ fetchClientSecret, onComplete: () => paid.current(sessionId.current) }),
    [fetchClientSecret]
  );

  return (
    <div className="modal wide" role="dialog" aria-label="Pagar Acceso Total">
      <button className="x" onClick={onClose} aria-label="Cerrar"><Close /></button>
      <h3>Acceso Total {plan === "anual" ? "anual · $999 MXN" : "mensual · $99 MXN"}</h3>
      <p>Paga con tarjeta, Apple Pay o Google Pay. El video te espera aquí.</p>
      {!stripePromise ? (
        <p className="msg err">Los pagos aún no están configurados.</p>
      ) : error ? (
        <p className="msg err">{error}</p>
      ) : (
        <div className="checkout">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  );
}
