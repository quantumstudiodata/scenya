"use client";

import { PASSWORD_RULES } from "@/lib/password";

const SHORT: Record<string, string> = { len: "8 a 64 caracteres", letter: "Una letra", num: "Un número", chars: "Símbolos permitidos: ! @ # $ % & * . _ - ? +" };

export default function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="prules" aria-label="Requisitos de la contraseña">
      {PASSWORD_RULES.map((r) => {
        const state = !value ? "" : r.test(value) ? "ok" : "bad";
        return (
          <li key={r.id} className={state} title={r.label}>
            <span className="dot" aria-hidden="true">{state === "ok" ? "✓" : state === "bad" ? "✕" : ""}</span>
            {SHORT[r.id] ?? r.label}
          </li>
        );
      })}
    </ul>
  );
}
