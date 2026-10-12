import { createClient } from "./supabase/server";

export type Series = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  genre: string;
  poster_url: string | null;
  is_featured: boolean;
  episodes: { count: number }[];
};

const FIELDS = "id, slug, title, synopsis, genre, poster_url, is_featured, episodes(count)";

export async function listSeries() {
  const supabase = await createClient();
  const { data } = await supabase.from("series").select(FIELDS).order("created_at", { ascending: false });
  return (data ?? []) as Series[];
}

export async function getSeries(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("series").select(FIELDS).eq("slug", slug).maybeSingle();
  return data as Series | null;
}

export function episodeCount(s: Series) {
  return s.episodes?.[0]?.count ?? 0;
}
