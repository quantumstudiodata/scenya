import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="panel" style={{ textAlign: "center" }}>
        <h1>No encontramos esa página</h1>
        <Link className="btn primary" href="/">Volver al inicio</Link>
      </div>
    </div>
  );
}
