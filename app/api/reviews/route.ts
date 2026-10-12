import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorName } from "@/lib/names";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { seriesId, slug, rating, body } = (await request.json().catch(() => ({}))) as {
    seriesId?: string; slug?: string; rating?: number; body?: string;
  };
  const text = body?.trim().slice(0, 500);
  if (!seriesId || !text || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Elige estrellas y escribe tu reseña." }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("reviews")
    .upsert(
      { series_id: seriesId, user_id: user.id, author_name: authorName(user), rating: Math.round(rating), body: text },
      { onConflict: "series_id,user_id" }
    )
    .select("id, author_name, rating, body, created_at")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  if (slug) revalidatePath(`/serie/${slug}`);
  return NextResponse.json({ review: data });
}
