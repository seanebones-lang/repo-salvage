"use client";
import { useActionState } from "react";
import { salvage, unlist, type ActionState } from "./actions";
import Link from "next/link";
import { Icon } from "@/components/icon";

type Props = {
  repoId: number;
  name: string;
  pushedAt: string;
  stale: boolean;
  listingId: number | null;
  note: string | null;
  license: string | null;
  analysisEnabled: boolean;
};

export default function RepoRow({
  repoId,
  name,
  pushedAt,
  stale,
  listingId,
  note,
  license,
  analysisEnabled,
}: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    salvage,
    null,
  );
  const licensed = !!license && license !== "NOASSERTION";
  return (
    <div className="dashboard-panel">
      <div className="dashboard-project">
        <strong>{name}</strong>
        <span className="chips">
          {stale && <span className="chip">inactive 12+ mo</span>}
          {listingId && <span className="chip">listed</span>}
          <span className="chip">last push {pushedAt.slice(0, 10)}</span>
          <span className={`chip ${licensed ? "" : "chip-warning"}`}>
            {licensed ? license : "Add a recognized license"}
          </span>
        </span>
      </div>
      <form action={action} className="repo-form">
        <input type="hidden" name="repoId" value={repoId} />
        <label htmlFor={`note-${repoId}`}>
          Your context (optional): what works, what to ignore, and what a new
          developer should know.
        </label>
        <textarea
          id={`note-${repoId}`}
          name="note"
          rows={2}
          maxLength={280}
          defaultValue={note ?? ""}
          placeholder="The CSV parser is useful on its own. The old admin UI needs a rewrite."
        />
        <div className="form-row">
          <button
            className="button button-primary"
            disabled={pending || !licensed || !analysisEnabled}
          >
            {pending
              ? "Reading source & preparing briefs…"
              : listingId
                ? "Re-analyze the parts"
                : "Make useful parts available"}
            <Icon name="arrow" size={15} />
          </button>
          {listingId && (
            <Link className="text-link" href={`/listing/${listingId}`}>
              View & review the parts <Icon name="arrow" size={15} />
            </Link>
          )}
          {state?.error && (
            <span className="err" role="alert">
              {state.error}
            </span>
          )}
          {state?.ok && (
            <span className="form-status" role="status">
              {state.ok}
            </span>
          )}
        </div>
      </form>
      {!licensed && (
        <p className="repo-limit">
          GitHub must recognize the repository license before it can be listed.{" "}
          <a
            className="text-link"
            href={`https://github.com/${name}`}
            target="_blank"
            rel="noreferrer"
          >
            Open repository
          </a>
        </p>
      )}
      {listingId && (
        <p className="repo-limit">
          Re-analysis replaces the briefs and clears their owner reviews. Review
          the new source version before confirming them again.
        </p>
      )}
      {listingId && (
        <form action={unlist} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={listingId} />
          <button className="button button-secondary button-small">
            Remove listing
          </button>
        </form>
      )}
    </div>
  );
}
