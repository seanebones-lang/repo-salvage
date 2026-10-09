"use client";
import { useActionState } from "react";
import { setComponentReview, type ActionState } from "@/app/dashboard/actions";

export function OwnerReview({
  listingId,
  partId,
  sourceSha,
  analyzedAt,
  reviewed,
}: {
  listingId: number;
  partId: string;
  sourceSha: string;
  analyzedAt: string;
  reviewed: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setComponentReview,
    null,
  );
  return (
    <form action={action} className="owner-review">
      <h3>Your review</h3>
      <p>
        Confirm that you have read this component brief and that it accurately
        describes this version of your code. This records your review; it does
        not certify independent testing.
      </p>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="partId" value={partId} />
      <input type="hidden" name="sourceSha" value={sourceSha} />
      <input type="hidden" name="analyzedAt" value={analyzedAt} />
      <input type="hidden" name="reviewed" value={String(!reviewed)} />
      <button className="button button-secondary" disabled={pending}>
        {pending
          ? "Saving…"
          : reviewed
            ? "Remove my review"
            : "Mark brief as owner reviewed"}
      </button>
      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="form-status" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}
