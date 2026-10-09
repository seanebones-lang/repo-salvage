"use client";
import { useState } from "react";

export default function ReportButton({ id }: { id: number }) {
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (state === "sent")
    return (
      <span className="form-status" role="status">
        Report recorded for the site operator.
      </span>
    );
  if (state === "idle")
    return (
      <button
        className="button button-secondary button-small"
        onClick={() => setState("open")}
      >
        Report a concern
      </button>
    );
  return (
    <form
      className="report-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          const response = await fetch(`/api/listings/${id}/report`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
          });
          if (response.ok) setState("sent");
          else
            setError(
              response.status === 429
                ? "This listing has received too many reports recently. Try again later."
                : "The report could not be recorded. The listing may no longer be available.",
            );
        } catch {
          setError(
            "Connection failed. Your report was not recorded; try again.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor={`report-${id}`}>What should the operator check?</label>
      <input
        id={`report-${id}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        placeholder="License issue, misleading brief, or another concern"
        required
      />
      <div className="form-row">
        <button
          className="button button-secondary button-small"
          disabled={pending}
        >
          {pending ? "Recording…" : "Submit report"}
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={pending}
          onClick={() => setState("idle")}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
