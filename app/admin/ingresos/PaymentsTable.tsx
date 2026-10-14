"use client";

import { useState } from "react";

export type Payment = {
  id: string; date: string; name: string; email: string; plan: string; amount: number; currency: string;
  reason: string; status: string; renews: string | null; receipt: string | null; stripeUrl: string;
};

const STATUS: Record<string, string> = {
  active: "Activa", trialing: "Prueba", past_due: "Pago pendiente", canceled: "Cancelada", unpaid: "Sin pagar", incomplete: "Incompleta",
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
const day = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function PaymentsTable({ payments }: { payments: Payment[] }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? payments.filter((p) => norm(`${p.name} ${p.email} ${p.plan} ${p.reason}`).includes(norm(q.trim()))) : payments;
  const total = shown.reduce((a, p) => a + p.amount, 0);
  const people = new Set(shown.map((p) => p.email || p.stripeUrl)).size;
  const currency = shown[0]?.currency ?? "mxn";

  function exportCsv() {
    const head = ["Fecha", "Nombre", "Correo", "Plan", "Tipo", "Monto", "Moneda", "Estado"];
    const rows = shown.map((p) => [day(p.date), p.name, p.email, p.plan, p.reason, (p.amount / 100).toFixed(2), p.currency.toUpperCase(), STATUS[p.status] ?? p.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "pagos-scenya.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="astats">
        <div className="astat"><b>{money(total, currency)}</b><span>cobrado</span></div>
        <div className="astat"><b>{shown.length}</b><span>pagos</span></div>
        <div className="astat"><b>{people}</b><span>personas</span></div>
      </div>
      <div className="acts" style={{ marginBottom: 12 }}>
        <input className="asearch" style={{ flex: 1, marginBottom: 0 }} type="search" placeholder="Buscar por nombre, correo o plan…" aria-label="Buscar pago" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn soft" onClick={exportCsv} disabled={!shown.length}>Descargar CSV</button>
      </div>
      {shown.length === 0 ? <p className="muted">{payments.length ? "Ningún pago coincide con la búsqueda." : "Sin pagos en este periodo."}</p> : (
        <div className="ptable-wrap">
          <table className="ptable">
            <thead>
              <tr><th>Fecha</th><th>Persona</th><th>Plan</th><th>Tipo</th><th>Monto</th><th>Membresía</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.date)}</td>
                  <td><b>{p.name || "Sin nombre"}</b><small>{p.email || "Sin correo"}</small></td>
                  <td>{p.plan}</td>
                  <td>{p.reason}</td>
                  <td><b>{money(p.amount, p.currency)}</b></td>
                  <td>
                    <span className={`pstat ${p.status === "active" || p.status === "trialing" ? "ok" : ""}`}>{STATUS[p.status] ?? (p.status || "—")}</span>
                    {p.renews && p.status === "active" && <small>hasta {day(p.renews)}</small>}
                  </td>
                  <td className="plinks">
                    {p.receipt && <a href={p.receipt} target="_blank" rel="noreferrer">Recibo</a>}
                    <a href={p.stripeUrl} target="_blank" rel="noreferrer">Stripe</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
