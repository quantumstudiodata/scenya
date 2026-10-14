import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Proyecto del editor de episodios (cortes, recorte, títulos…), guardado como
// JSON en el almacenamiento privado para retomarlo donde se quedó.
const path = (id: string) => `projects/${id}.json`;
const valid = (id: string | null): id is string => !!id && /^[0-9a-f-]{36}$/i.test(id);

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("seriesId");
  if (!valid(id)) return NextResponse.json({ error: "Serie no válida." }, { status: 400 });
  const { data } = await createAdminClient().storage.from("videos").download(path(id));
  if (!data) return NextResponse.json({ project: null });
  try { return NextResponse.json({ project: JSON.parse(await data.text()) }); }
  catch { return NextResponse.json({ project: null }); }
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { seriesId?: string; project?: unknown };
  if (!valid(b.seriesId ?? null) || !b.project || typeof b.project !== "object") {
    return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  }
  const body = JSON.stringify(b.project);
  if (body.length > 500_000) return NextResponse.json({ error: "Proyecto demasiado grande." }, { status: 400 });
  const { error } = await createAdminClient().storage.from("videos")
    .upload(path(b.seriesId!), new Blob([body], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) return NextResponse.json({ error: "No se pudo guardar el proyecto." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
