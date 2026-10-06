"use client";
import { useState } from "react";

export default function UsedButton({ id, initial }: { id: number; initial: number }) {
  const key = `salvage-used-${id}`;
  const [count, setCount] = useState(initial);
  const [done, setDone] = useState(() => {
    try { return typeof window !== "undefined" && !!localStorage.getItem(key); } catch { return false; }
  });
  return (
    <button
      className="ghost"
      disabled={done}
      onClick={async () => {
        setDone(true);
        try { localStorage.setItem(key, "1"); } catch {}
        const r = await fetch(`/api/listings/${id}/used`, { method: "POST" });
        if (r.ok) setCount((await r.json()).used_count);
      }}
    >
      {done ? "Thanks!" : "I forked / used this"} · {count}
    </button>
  );
}
