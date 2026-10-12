"use client";

import { PASSWORD_RULES } from "@/lib/password";

export default function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="prules" aria-label="Requisitos de la contraseña">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return <li key={r.id} className={value && ok ? "ok" : value ? "bad" : ""}>{value && ok ? "✓" : "•"} {r.label}</li>;
      })}
    </ul>
  );
}
