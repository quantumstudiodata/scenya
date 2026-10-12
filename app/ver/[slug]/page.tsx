import { notFound } from "next/navigation";
import { getSeries, getEpisodes } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { FREE_EPISODES, hasAccesoTotal } from "@/lib/access";
import { posterProps } from "@/lib/tone";
import Player from "./Player";

export default async function Ver({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}) {
  const { slug } = await params;
  const s = await getSeries(slug);
  if (!s) notFound();

  const episodes = await getEpisodes(s.id);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const subscribed = await hasAccesoTotal(user?.id);
  const ep = Math.min(Math.max(Number((await searchParams).ep) || 1, 1), Math.max(episodes.length, 1));
  const p = posterProps(s);

  return (
    <Player
      series={{ slug: s.slug, title: s.title, synopsis: s.synopsis, poster: s.poster_url, className: p.className }}
      episodes={episodes}
      startEp={ep}
      free={FREE_EPISODES}
      initialSubscribed={subscribed}
      publishableKey={process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
    />
  );
}
