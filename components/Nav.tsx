"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavUser = { initial: string; label: string; guest: boolean; admin: boolean } | null;

export default function Nav({ user }: { user: NavUser }) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

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
          {link("/mi-lista", "Mi lista")}
          {link("/planes", "Planes")}
        </ul>
        <div className="sp" />
        {user ? (
          <div className="umenu" ref={menu}>
            <button className="btn soft" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
              <span className="av">{user.initial}</span><span className="ulabel">{user.label}</span>
            </button>
            {open && (
              <ul role="menu">
                <li><Link href="/cuenta" role="menuitem">Mi cuenta</Link></li>
                <li><Link href="/mi-lista" role="menuitem">Mis listas</Link></li>
                {user.admin && <li><Link href="/admin" role="menuitem">Panel de administrador</Link></li>}
                <li className="sep" />
                <li>
                  <form action="/auth/salir" method="POST"><button role="menuitem">{user.guest ? "Salir del modo invitado" : "Cerrar sesión"}</button></form>
                </li>
              </ul>
            )}
          </div>
        ) : (
          <Link className="btn soft" href="/entrar">Entrar</Link>
        )}
        <Link className="btn primary" href="/planes">Acceso Total</Link>
      </div>
    </nav>
  );
}
