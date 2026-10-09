"use client";
import { useActionState } from "react";
import Link from "next/link";
import { salvage, type ActionState } from "../actions";
export default function RetryForm({
  repoId,
  note,
  draftId,
  requestKey,
  uncertain,
}: {
  repoId: number;
  note: string | null;
  draftId: string | null;
  requestKey: string;
  uncertain: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    salvage,
    null,
  );
  return (
    <form action={action} className="repo-form">
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="draftId" value={draftId ?? ""} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <label htmlFor="retry-note">Context for the new attempt</label>
      <textarea
        id="retry-note"
        name="note"
        rows={3}
        maxLength={280}
        defaultValue={note ?? ""}
      />
      <p className="small muted">
        This starts a new job for the current default-branch commit and uses a
        new analysis allowance. A draft must still match that commit.
      </p>
      {uncertain && (
        <p className="notice">
          The earlier provider request may already have been charged. Starting a
          new attempt can incur another charge.
        </p>
      )}
      <button
        className="button button-primary"
        disabled={pending || !!state?.jobId}
      >
        {pending ? "Queuing new attempt…" : "Start a new analysis attempt"}
      </button>
      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}
      {state?.jobId && (
        <Link className="text-link" href={`/dashboard/jobs/${state.jobId}`}>
          Open the new analysis job
        </Link>
      )}
    </form>
  );
}
