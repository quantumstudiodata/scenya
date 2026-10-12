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

export type Episode = { id: string; number: number; title: string };

export type Review = { id: string; author_name: string; rating: number; body: string; created_at: string };

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

export async function getEpisodes(seriesId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("episodes")
    .select("id, number, title")
    .eq("series_id", seriesId)
    .order("number");
  return (data ?? []) as Episode[];
}

export async function getReviews(seriesId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, author_name, rating, body, created_at")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: false })
    .limit(30);
  const reviews = (data ?? []) as Review[];
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  return { reviews, avg };
}

export async function seriesLikes(seriesId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("episode_likes")
    .select("episode_id, episodes!inner(series_id)", { count: "exact", head: true })
    .eq("episodes.series_id", seriesId);
  return count ?? 0;
}

export function episodeCount(s: Series) {
  return s.episodes?.[0]?.count ?? 0;
}

export function compact(n: number) {
  return new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
