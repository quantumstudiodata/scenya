import SeriesCard from "@/components/SeriesCard";
import { listSeries } from "@/lib/catalog";

export default async function SeriesPage() {
  const series = await listSeries();
  return (
    <div className="wrap">
      <section>
        <div className="head"><h2>Todas las series</h2></div>
        <div className="grid">
          {series.map((s, i) => <SeriesCard key={s.id} s={s} i={i} />)}
        </div>
      </section>
    </div>
  );
}
