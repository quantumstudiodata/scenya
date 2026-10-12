import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";

type Body = {
  id?: string; title?: string; slug?: string; genre?: string; synopsis?: string;
  free_episodes?: number; is_featured?: boolean; poster_url?: string | null;
};

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as Body;
  const title = b.title?.trim();
  if (!title) return NextResponse.json({ error: "La serie necesita un título." }, { status: 400 });

  const row = {
    title,
    slug: slugify(b.slug?.trim() || title),
    genre: b.genre?.trim() ?? "",
    synopsis: b.synopsis?.trim() ?? "",
    free_episodes: Math.max(0, Math.min(500, Math.round(Number(b.free_episodes ?? 10)))),
    is_featured: !!b.is_featured,
    poster_url: b.poster_url || null,
  };
  const admin = createAdminClient();
  const q = b.id ? admin.from("series").update(row).eq("id", b.id) : admin.from("series").insert(row);
  const { data, error } = await q.select("id, slug").single();
  if (error) {
    const msg = error.code === "23505" ? "Ya existe una serie con ese enlace (slug). Cambia el título o el slug." : "No se pudo guardar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ series: data });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { error } = await createAdminClient().from("series").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
