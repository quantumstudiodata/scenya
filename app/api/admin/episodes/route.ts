import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as {
    action?: string; seriesId?: string; number?: number; title?: string; videoPath?: string; duration?: number;
    moves?: { from: number; to: number }[];
  };
  if (b.action === "renumber") return renumber(b.seriesId, b.moves);
  const number = Math.round(Number(b.number));
  if (!b.seriesId || !number || number < 1) return NextResponse.json({ error: "Número de episodio no válido." }, { status: 400 });

  const admin = createAdminClient();
  const { data: ep, error } = await admin
    .from("episodes")
    .upsert({
      series_id: b.seriesId, number, title: b.title?.trim() || `Episodio ${number}`,
      ...(b.duration && b.duration > 0 ? { duration_seconds: Math.round(b.duration) } : {}),
    }, { onConflict: "series_id,number" })
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
  // ?id=… borra uno; ?ids=a,b,c borra varios.
  const sp = request.nextUrl.searchParams;
  const ids = (sp.get("ids") ?? sp.get("id") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const admin = createAdminClient();
  const { data: vids } = await admin.from("episode_videos").select("video_url").in("episode_id", ids);
  const { error } = await admin.from("episodes").delete().in("id", ids);
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  const files = (vids ?? []).map((v) => v.video_url).filter((u) => u && !/^https?:\/\//.test(u));
  if (files.length) await admin.storage.from("videos").remove(files);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

// Cambia el número de varios episodios a la vez (el editor al quitar o unir
// partes). Primero pasan a números temporales negativos para no chocar; si un
// número destino lo ocupa otro episodio, ese episodio se reemplaza (se borra).
async function renumber(seriesId?: string, moves?: { from: number; to: number }[]) {
  const list = (moves ?? []).map((m) => ({ from: Math.round(m.from), to: Math.round(m.to) })).filter((m) => m.from > 0 && m.to > 0 && m.from !== m.to);
  if (!seriesId || !list.length) return NextResponse.json({ ok: true });
  if (new Set(list.map((m) => m.to)).size !== list.length) return NextResponse.json({ error: "Números repetidos." }, { status: 400 });
  const admin = createAdminClient();
  const froms = list.map((m) => m.from);
  for (const m of list) {
    const { error } = await admin.from("episodes").update({ number: -m.from }).eq("series_id", seriesId).eq("number", m.from);
    if (error) return NextResponse.json({ error: "No se pudieron reordenar los episodios." }, { status: 500 });
  }
  const { data: taken } = await admin.from("episodes").select("id, number, episode_videos(video_url)")
    .eq("series_id", seriesId).in("number", list.map((m) => m.to));
  for (const ep of taken ?? []) {
    if (froms.includes(ep.number)) continue;
    const v = ep.episode_videos as unknown as { video_url: string } | { video_url: string }[] | null;
    const url = (Array.isArray(v) ? v[0] : v)?.video_url;
    await admin.from("episodes").delete().eq("id", ep.id);
    if (url && !/^https?:\/\//.test(url)) await admin.storage.from("videos").remove([url]);
  }
  for (const m of list) {
    const { error } = await admin.from("episodes").update({ number: m.to }).eq("series_id", seriesId).eq("number", -m.from);
    if (error) return NextResponse.json({ error: "No se pudieron reordenar los episodios." }, { status: 500 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
