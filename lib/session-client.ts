"use client";

import { createClient } from "./supabase/browser";

// Garantiza una sesión: si no hay, entra como invitado.
export async function ensureSession() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}
