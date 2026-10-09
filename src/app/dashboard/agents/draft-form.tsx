"use client";
import { useActionState } from "react";
import { salvage, type ActionState } from "../actions";
export default function DraftForm({
  draft,
  analysisEnabled,
  requestKey,
}: {
  draft: { id: string; repo_id: number; note: string };
  analysisEnabled: boolean;
  requestKey: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    salvage,
    null,
  );
  return (
    <form action={action} className="repo-form">
      <input type="hidden" name="repoId" value={draft.repo_id} />
      <input type="hidden" name="draftId" value={draft.id} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <label htmlFor={`draft-${draft.id}`}>
        Review and edit the agent's context
      </label>
      <textarea
        id={`draft-${draft.id}`}
        name="note"
        rows={3}
        maxLength={280}
        defaultValue={draft.note}
        required
      />
      <p className="small muted">
        Analysis replaces any existing briefs and clears owner reviews. If the
        default branch has moved since this proposal, ask your agent for a new
        draft.
      </p>
      <button
        className="button button-primary"
        disabled={pending || !analysisEnabled || !!state?.ok}
      >
        {pending
          ? "Queuing reviewed draft…"
          : "Analyze and publish reviewed draft"}
      </button>
      {!analysisEnabled && (
        <p className="notice">Paid analysis is not configured.</p>
      )}
      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && <p role="status">{state.ok}</p>}
      {state?.jobId && (
        <a className="text-link" href={`/dashboard/jobs/${state.jobId}`}>
          Open analysis progress
        </a>
      )}
    </form>
  );
}
