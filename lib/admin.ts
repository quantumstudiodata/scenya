import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

// Administradores: correos en ADMIN_EMAILS (separados por coma), con correo confirmado.
export function isAdmin(user: User | null | undefined) {
  if (!user || user.is_anonymous || !user.email || !user.email_confirmed_at) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isAdmin(user) ? user : null;
}
