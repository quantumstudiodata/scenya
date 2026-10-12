import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Agrega o quita una serie de "Mi lista".
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const { seriesId } = (await request.json().catch(() => ({}))) as { seriesId?: string };
  if (!seriesId) return NextResponse.json({ error: "Falta la serie" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("my_list").select("series_id").eq("user_id", user.id).eq("series_id", seriesId).maybeSingle();
  if (row) await admin.from("my_list").delete().eq("user_id", user.id).eq("series_id", seriesId);
  else await admin.from("my_list").insert({ user_id: user.id, series_id: seriesId });
  return NextResponse.json({ inList: !row });
}
