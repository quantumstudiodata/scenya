import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorName } from "@/lib/names";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await createAdminClient()
    .from("comments")
    .select("id, author_name, body, created_at")
    .eq("episode_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { body } = (await request.json().catch(() => ({}))) as { body?: string };
  const text = body?.trim().slice(0, 300);
  if (!text) return NextResponse.json({ error: "Escribe un comentario." }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("comments")
    .insert({ episode_id: id, user_id: user.id, author_name: authorName(user), body: text })
    .select("id, author_name, body, created_at")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo publicar." }, { status: 500 });
  return NextResponse.json({ comment: data });
}
