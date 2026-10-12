import "server-only";
import { createAdminClient } from "./supabase/admin";

// Valor por defecto; cada serie define sus propios episodios gratis (series.free_episodes).
export const FREE_EPISODES = 10;

const ACTIVE = ["active", "trialing"];

export async function hasAccesoTotal(userId: string | undefined) {
  if (!userId) return false;
  const { data } = await createAdminClient()
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !ACTIVE.includes(data.status)) return false;
  return !data.current_period_end || new Date(data.current_period_end) > new Date();
}
