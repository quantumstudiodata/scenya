import SeriesCard from "@/components/SeriesCard";
import { listSeries } from "@/lib/catalog";

export default async function SeriesPage() {
  const series = await listSeries();
  return (
    <div className="wrap">
      <section>
        <div className="head"><h2>Todas las series</h2></div>
        <div className="grid">
          {series.map((s) => <SeriesCard key={s.id} s={s} />)}
        </div>
      </section>
    </div>
  );
}
