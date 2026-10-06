"use client";
import { useActionState } from "react";
import { salvage, unlist, type ActionState } from "./actions";

type Props = {
  repoId: number;
  name: string;
  pushedAt: string;
  stale: boolean;
  listingId: number | null;
  note: string | null;
};

export default function RepoRow({ repoId, name, pushedAt, stale, listingId, note }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvage, null);
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{name}</strong>
        <span className="chips">
          {stale && <span className="chip warn">inactive 12+ mo</span>}
          {listingId && <span className="chip">listed</span>}
          <span className="chip">last push {pushedAt.slice(0, 10)}</span>
        </span>
      </div>
      <form action={action}>
        <input type="hidden" name="repoId" value={repoId} />
        <textarea name="note" rows={2} maxLength={280} defaultValue={note ?? ""}
          placeholder='Optional note, e.g. "auth middleware is solid, ignore the UI"' />
        <div className="row" style={{ marginTop: 8 }}>
          <button disabled={pending}>{pending ? "Summarizing…" : listingId ? "Re-summarize" : "Mark available for salvage"}</button>
          {state?.error && <span className="err">{state.error}</span>}
          {state?.ok && <span className="muted">{state.ok}</span>}
        </div>
      </form>
      {listingId && (
        <form action={unlist} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={listingId} />
          <button className="ghost">Remove listing</button>
        </form>
      )}
    </div>
  );
}
