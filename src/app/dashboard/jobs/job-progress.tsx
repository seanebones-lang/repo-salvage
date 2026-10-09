"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { publicJob } from "@/lib/analysis-jobs";
type Job = ReturnType<typeof publicJob>;
const descriptions: Record<Job["status"], string> = {
  queued: "Waiting for the analysis worker.",
  inspecting:
    "Inspecting source at the selected commit and checking dependencies.",
  generating: "Preparing component briefs from the inspected evidence.",
  publishing: "Checking current ownership and saving the validated result.",
  needs_attention:
    "The provider request needs your attention before another attempt.",
  succeeded: "Analysis completed and the result was saved.",
  failed: "Analysis stopped. Your existing listing was preserved.",
  canceled: "Publication was canceled.",
};
export default function JobProgress({ initial }: { initial: Job }) {
  const router = useRouter();
  const [job, setJob] = useState(initial),
    [connection, setConnection] = useState<string | null>(null);
  const active = ["queued", "inspecting", "generating", "publishing"].includes(
    job.status,
  );
  useEffect(() => {
    if (!active) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`/api/analysis-jobs/${initial.id}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (stopped) return;
        if (response.status === 401) {
          setConnection(
            "Sign in again to view this job. Its stored progress remains available.",
          );
          return;
        }
        if (response.status === 404) {
          setConnection("This job was removed or is no longer available.");
          return;
        }
        if (!response.ok) throw Error("Unavailable");
        const value = (await response.json()) as Job;
        if (!stopped) {
          setJob(value);
          setConnection(null);
          if (
            !["queued", "inspecting", "generating", "publishing"].includes(
              value.status,
            )
          )
            router.refresh();
        }
      } catch {
        if (!stopped)
          setConnection("Progress is temporarily unavailable. Reconnecting…");
      }
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 3000);
    };
    timer = setTimeout(() => {
      void poll();
    }, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, initial.id, router]);
  return (
    <div className="dashboard-panel" aria-live="polite">
      <span className="eyebrow">{job.status.replaceAll("_", " ")}</span>
      <p>{descriptions[job.status]}</p>
      {job.error_message && <p className="notice">{job.error_message}</p>}
      {connection && (
        <p className="err" role="alert">
          {connection}
        </p>
      )}
      <p className="small muted">
        Updated {new Date(job.updated_at).toISOString()} · source inspection
        attempts {job.inspection_attempts}
      </p>
      {active && (
        <p className="small muted">
          You can close this page. The server keeps the job and its progress.
        </p>
      )}
      {job.status === "succeeded" && job.listing_id && (
        <Link
          className="text-link"
          href={`/listing/${job.listing_id}`}
          prefetch={false}
        >
          Open and review the saved analysis
        </Link>
      )}
    </div>
  );
}
