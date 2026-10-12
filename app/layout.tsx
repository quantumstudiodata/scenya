import type { Metadata } from "next";
import { Sora, Inter } from "next/font/google";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const display = Sora({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Scenya — Series & Dramas",
  description: "Miniseries en episodios cortos. Una membresía, todo el catálogo.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>
        <nav>
          <div className="wrap">
            <Link className="logo" href="/">
              Scen<span>ya</span>
              <small>Series &amp; Dramas</small>
            </Link>
            <ul>
              <li><Link href="/">Inicio</Link></li>
              <li><Link href="/series">Series</Link></li>
              <li><Link href="/planes">Planes</Link></li>
            </ul>
            <div className="sp" />
            {user ? (
              <Link className="btn ghost" href="/cuenta">Mi cuenta</Link>
            ) : (
              <Link className="btn ghost" href="/entrar">Entrar</Link>
            )}
            <Link className="btn primary" href="/planes">Acceso Total</Link>
          </div>
        </nav>
        <main>{children}</main>
        <footer>
          <div className="wrap">
            <span>© {new Date().getFullYear()} Scenya, Series &amp; Dramas</span>
            <span>Términos · Privacidad · Soporte</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
