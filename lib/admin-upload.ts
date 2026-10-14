import { createClient } from "@/lib/supabase/browser";

// Sube un archivo directo al almacenamiento de Supabase con un enlace firmado.
export async function upload(kind: "poster" | "video", file: File) {
  const ext = file.name.split(".").pop() ?? (kind === "video" ? "mp4" : "jpg");
  const r = await fetch("/api/admin/upload", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ext }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "No se pudo preparar la subida.");
  const { error } = await createClient().storage.from(d.bucket).uploadToSignedUrl(d.path, d.token, file, { contentType: file.type });
  if (error) throw new Error(error.message.includes("size") ? "El archivo es demasiado grande." : "No se pudo subir el archivo.");
  return { path: d.path as string, publicUrl: d.publicUrl as string | null };
}

// Crea o actualiza un episodio (y su video si se pasa la ruta subida).
export async function saveEpisodeApi(body: { seriesId: string; number: number; title: string; videoPath?: string; duration?: number }) {
  const r = await fetch("/api/admin/episodes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "No se pudo guardar el episodio.");
  return d.episode as { id: string; number: number; title: string };
}
