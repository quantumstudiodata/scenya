import type { Metadata } from "next";
import { Sora, Inter } from "next/font/google";
import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const display = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
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
        <Nav account={user ? (user.is_anonymous ? "Invitado" : "Mi cuenta") : null} />
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
