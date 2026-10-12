"use client";

import { useState } from "react";
import { Share } from "./Icons";

export async function shareLink(title: string, path: string) {
  const url = `${window.location.origin}${path}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `Mira "${title}" en Scenya`, url });
      return null;
    }
    await navigator.clipboard.writeText(url);
    return "Enlace copiado";
  } catch {
    return null;
  }
}

export default function ShareButton({ title, path }: { title: string; path: string }) {
  const [toast, setToast] = useState<string | null>(null);
  return (
    <>
      <button className="btn soft" onClick={async () => {
        const t = await shareLink(title, path);
        if (t) { setToast(t); setTimeout(() => setToast(null), 1600); }
      }}><Share />Compartir</button>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
