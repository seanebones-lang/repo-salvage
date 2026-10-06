"use client";
import { useState } from "react";

export default function ReportButton({ id }: { id: number }) {
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [reason, setReason] = useState("");
  if (state === "sent") return <span className="muted">Thanks, report received.</span>;
  if (state === "idle") return <button className="ghost" onClick={() => setState("open")}>Report</button>;
  return (
    <form
      className="row"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await fetch(`/api/listings/${id}/report`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (r.ok) setState("sent");
      }}
    >
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="What's wrong with this listing?" required />
      <button>Send</button>
    </form>
  );
}
