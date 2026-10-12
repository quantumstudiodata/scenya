import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Da un enlace para que el navegador suba el archivo directo al almacenamiento
// (los videos son demasiado grandes para pasar por el servidor).
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Solo administradores." }, { status: 403 });
  const { kind, ext } = (await request.json().catch(() => ({}))) as { kind?: string; ext?: string };
  const bucket = kind === "video" ? "videos" : kind === "poster" ? "posters" : null;
  const safeExt = (ext ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  if (!bucket || !safeExt) return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });

  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${safeExt}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "No se pudo preparar la subida." }, { status: 500 });
  const publicUrl = bucket === "posters" ? admin.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return NextResponse.json({ bucket, path, token: data.token, publicUrl });
}
