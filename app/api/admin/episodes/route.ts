import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { seriesId?: string; number?: number; title?: string; videoPath?: string };
  const number = Math.round(Number(b.number));
  if (!b.seriesId || !number || number < 1) return NextResponse.json({ error: "Número de episodio no válido." }, { status: 400 });

  const admin = createAdminClient();
  const { data: ep, error } = await admin
    .from("episodes")
    .upsert({ series_id: b.seriesId, number, title: b.title?.trim() || `Episodio ${number}` }, { onConflict: "series_id,number" })
    .select("id, number, title")
    .single();
  if (error || !ep) return NextResponse.json({ error: "No se pudo guardar el episodio." }, { status: 500 });

  if (b.videoPath) {
    // Si había un video anterior en el almacenamiento, se borra.
    const { data: old } = await admin.from("episode_videos").select("video_url").eq("episode_id", ep.id).maybeSingle();
    await admin.from("episode_videos").upsert({ episode_id: ep.id, video_url: b.videoPath });
    if (old?.video_url && old.video_url !== b.videoPath && !/^https?:\/\//.test(old.video_url)) {
      await admin.storage.from("videos").remove([old.video_url]);
    }
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ episode: ep });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const admin = createAdminClient();
  const { data: v } = await admin.from("episode_videos").select("video_url").eq("episode_id", id).maybeSingle();
  const { error } = await admin.from("episodes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  if (v?.video_url && !/^https?:\/\//.test(v.video_url)) await admin.storage.from("videos").remove([v.video_url]);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
