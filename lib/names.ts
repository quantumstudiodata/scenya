import type { User } from "@supabase/supabase-js";

// Nombre público sin datos personales: "Invitado 4821" o "Fan 4821".
export function authorName(user: User) {
  const code = (parseInt(user.id.replace(/-/g, "").slice(-6), 16) % 9000) + 1000;
  return `${user.is_anonymous ? "Invitado" : "Fan"} ${code}`;
}
