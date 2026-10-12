import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_EPISODES, hasAccesoTotal } from "@/lib/access";

// Datos de un episodio. La URL del video solo sale si está permitido verlo.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: ep } = await admin
    .from("episodes")
    .select("id, number, episode_videos(video_url)")
    .eq("id", id)
    .maybeSingle();
  if (!ep) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const locked = ep.number > FREE_EPISODES && !(await hasAccesoTotal(user?.id));
  const v = ep.episode_videos as unknown as { video_url: string } | { video_url: string }[] | null;
  const videoUrl = locked ? null : (Array.isArray(v) ? v[0]?.video_url : v?.video_url) ?? null;

  const [{ count: likes }, { count: comments }, mine] = await Promise.all([
    admin.from("episode_likes").select("*", { count: "exact", head: true }).eq("episode_id", id),
    admin.from("comments").select("*", { count: "exact", head: true }).eq("episode_id", id),
    user
      ? admin.from("episode_likes").select("episode_id").eq("episode_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({ locked, videoUrl, likes: likes ?? 0, comments: comments ?? 0, liked: !!mine.data });
}
