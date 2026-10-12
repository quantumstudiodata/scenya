"use client";

import { useState } from "react";
import { ensureSession } from "@/lib/session-client";
import { Bookmark, Check } from "./Icons";

export default function MyListButton({ seriesId, initial }: { seriesId: string; initial: boolean }) {
  const [inList, setInList] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await ensureSession();
    setInList((v) => !v);
    const r = await fetch("/api/my-list", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seriesId }),
    });
    if (r.ok) setInList((await r.json()).inList);
    else setInList((v) => !v);
    setBusy(false);
  }
  return (
    <button className="btn soft" onClick={toggle} disabled={busy} aria-pressed={inList}>
      {inList ? <><Check />En mi lista</> : <><Bookmark />Mi lista</>}
    </button>
  );
}
