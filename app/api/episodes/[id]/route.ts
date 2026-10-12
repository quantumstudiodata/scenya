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

  let { data: ep, error } = await admin
    .from("episodes")
    .select("id, number, episode_videos(video_url), series(free_episodes)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // Respaldo mientras no exista series.free_episodes (migración 0003).
    ({ data: ep } = await admin.from("episodes").select("id, number, episode_videos(video_url)").eq("id", id).maybeSingle() as never);
  }
  if (!ep) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x) ?? null;
  const free = one(ep.series as unknown as { free_episodes: number } | null)?.free_episodes ?? FREE_EPISODES;
  const locked = ep.number > free && !(await hasAccesoTotal(user?.id));
  const raw = locked ? null : one(ep.episode_videos as unknown as { video_url: string } | null)?.video_url ?? null;
  // Videos subidos al almacenamiento privado: enlace temporal de 3 horas.
  let videoUrl = raw;
  if (raw && !/^https?:\/\//.test(raw)) {
    const { data } = await admin.storage.from("videos").createSignedUrl(raw, 60 * 60 * 3);
    videoUrl = data?.signedUrl ?? null;
  }

  const [{ count: likes }, { count: comments }, mine] = await Promise.all([
    admin.from("episode_likes").select("*", { count: "exact", head: true }).eq("episode_id", id),
    admin.from("comments").select("*", { count: "exact", head: true }).eq("episode_id", id),
    user
      ? admin.from("episode_likes").select("episode_id").eq("episode_id", id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({ locked, videoUrl, likes: likes ?? 0, comments: comments ?? 0, liked: !!mine.data });
}
