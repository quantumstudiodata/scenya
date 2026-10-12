import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("episode_likes").select("episode_id").eq("episode_id", id).eq("user_id", user.id).maybeSingle();
  if (existing) {
    await admin.from("episode_likes").delete().eq("episode_id", id).eq("user_id", user.id);
  } else {
    await admin.from("episode_likes").insert({ episode_id: id, user_id: user.id });
  }
  const { count } = await admin.from("episode_likes").select("*", { count: "exact", head: true }).eq("episode_id", id);
  return NextResponse.json({ liked: !existing, likes: count ?? 0 });
}
