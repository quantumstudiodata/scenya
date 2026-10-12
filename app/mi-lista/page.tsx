import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SeriesCard from "@/components/SeriesCard";
import ContinueWatching from "@/components/ContinueWatching";
import type { Series } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function MiLista() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let series: Series[] = [];
  if (user) {
    const { data } = await createAdminClient()
      .from("my_list")
      .select("created_at, series(id, slug, title, synopsis, genre, poster_url, is_featured, free_episodes, episodes(count))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    series = (data ?? []).map((r) => r.series as unknown as Series).filter(Boolean);
  }

  return (
    <div className="wrap" style={{ paddingBlock: "24px 40px" }}>
      <ContinueWatching />
      <div className="row-h"><h2>Mi lista</h2></div>
      {series.length ? (
        <div className="grid">{series.map((s) => <SeriesCard key={s.id} s={s} />)}</div>
      ) : (
        <div className="empty-state">
          <p>Tu lista está vacía.</p>
          <p className="muted">Toca <b>“Mi lista”</b> en cualquier serie para guardarla aquí y verla después.</p>
          <Link className="btn primary" href="/series">Explorar series</Link>
        </div>
      )}
    </div>
  );
}
