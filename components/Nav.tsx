"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ account }: { account: string | null }) {
  const [solid, setSolid] = useState(false);
  const path = usePathname();
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const link = (href: string, label: string) => (
    <li><Link href={href} aria-current={path === href ? "page" : undefined}>{label}</Link></li>
  );

  return (
    <nav className={`nav${solid ? " solid" : ""}`}>
      <div className="wrap">
        <Link className="logo" href="/">Scen<span>ya</span><small>Series &amp; Dramas</small></Link>
        <ul>
          {link("/", "Inicio")}
          {link("/series", "Series")}
          {link("/planes", "Planes")}
        </ul>
        <div className="sp" />
        <Link className="btn soft" href={account ? "/cuenta" : "/entrar"}>{account ?? "Entrar"}</Link>
        <Link className="btn primary" href="/planes">Acceso Total</Link>
      </div>
    </nav>
  );
}
