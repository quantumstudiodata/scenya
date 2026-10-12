import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import SeriesEditor, { type AdminEpisode, type AdminSeries } from "./SeriesEditor";

export const dynamic = "force-dynamic";

export default async function EditSeries({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) notFound();
  const { id } = await params;
  if (id === "nueva") return <SeriesEditor series={null} episodes={[]} />;

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("series")
    .select("id, slug, title, genre, synopsis, poster_url, free_episodes, is_featured")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const { data: eps } = await admin
    .from("episodes")
    .select("id, number, title, episode_videos(video_url)")
    .eq("series_id", id)
    .order("number");

  const episodes: AdminEpisode[] = (eps ?? []).map((e) => {
    const v = e.episode_videos as unknown as { video_url: string } | { video_url: string }[] | null;
    return { id: e.id, number: e.number, title: e.title, hasVideo: !!(Array.isArray(v) ? v[0] : v) };
  });
  return <SeriesEditor series={s as AdminSeries} episodes={episodes} />;
}
