"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/auth";
import {
  deleteListing,
  getListing,
  analysisBaseline,
  reviewComponent,
} from "@/lib/db";
import {
  getOwnedPublicRepo,
  resolveSourceCommit,
  isPublicRepoFresh,
} from "@/lib/github";
import { draftById } from "@/lib/contributions";
import {
  enqueueAnalysis,
  jobForKey,
  payloadHash,
  cancelJob,
} from "@/lib/analysis-jobs";

export type ActionState = {
  error?: string;
  ok?: string;
  jobId?: string;
} | null;
export async function salvage(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const repoId = Number(form.get("repoId"));
  const key = String(form.get("requestKey") ?? "");
  if (!Number.isSafeInteger(repoId) || repoId < 1)
    return { error: "Choose a valid repository." };
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key))
    return { error: "Refresh this page before starting an analysis." };
  const note =
    String(form.get("note") ?? "")
      .trim()
      .slice(0, 280) || null;
  const draftId = String(form.get("draftId") ?? "") || null;
  if (draftId && draftId.length > 80) return { error: "Choose a valid draft." };
  const hash = payloadHash(repoId, note, draftId);
  try {
    const replay = jobForKey(session.ghId, key);
    if (replay) {
      if (replay.payload_hash !== hash)
        return {
          error:
            "This request key belongs to different context. Refresh before submitting.",
        };
      return { ok: "Open the saved analysis progress.", jobId: replay.id };
    }
    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANALYSIS_WORKER_ENABLED !== "1"
    )
      return {
        error:
          "Background analysis is not configured on this installation. Existing listings remain removable.",
      };
    const baseline = analysisBaseline(repoId);
    const repo = await getOwnedPublicRepo(
      session.accessToken,
      repoId,
      session.login,
    );
    if (repo.id !== repoId || repo.owner.id !== session.ghId)
      throw Error("Repository ownership changed.");
    if (!repo.license?.spdx_id || repo.license.spdx_id === "NOASSERTION")
      return {
        error:
          "Add a recognized license to the repository before listing it for reuse. GitHub must identify its SPDX license.",
      };
    const sourceSha = await resolveSourceCommit(session.accessToken, repo);
    if (draftId) {
      const draft = draftById(draftId, session.ghId);
      if (!draft || draft.repo_id !== repoId || draft.status !== "pending")
        throw Error(
          "This draft is no longer actionable. Refresh your agent inbox.",
        );
      if (draft.source_sha !== sourceSha)
        throw Error(
          "The default branch moved since this draft. Prepare a new draft for the current commit.",
        );
    }
    const job = enqueueAnalysis({
      ownerId: session.ghId,
      repoId,
      repoName: repo.full_name,
      sourceSha,
      note,
      draftId,
      key,
      model: process.env.SUMMARY_MODEL ?? "claude-haiku-5-5",
      baseline,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agents");
    return {
      ok: "Analysis queued. You can close this page and return to its progress later.",
      jobId: job.id,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not queue analysis.",
    };
  }
}
export async function cancelAnalysis(form: FormData) {
  const session = await getSession();
  if (!session) return;
  cancelJob(String(form.get("jobId") ?? ""), session.ghId);
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/agents");
}

export async function setComponentReview(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const id = Number(form.get("listingId"));
  const listing = getListing(id);
  if (!listing || listing.owner_id !== session.ghId)
    return { error: "This listing is not yours." };
  if (!(await isPublicRepoFresh(listing.github_repo_id, session.ghId)))
    return {
      error: "GitHub could not confirm this public repository is still yours.",
    };
  const part = String(form.get("partId") ?? "");
  const reviewed = form.get("reviewed") === "true";
  const updated = reviewComponent(
    id,
    session.ghId,
    part,
    String(form.get("sourceSha") ?? ""),
    String(form.get("analyzedAt") ?? ""),
    reviewed,
  );
  if (!updated)
    return { error: "This analysis has changed. Refresh before reviewing it." };
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/listing/${id}`);
  revalidatePath(`/listing/${id}/parts/${part}`);
  return {
    ok: reviewed
      ? "Your review is recorded for this analysis."
      : "Owner review removed.",
  };
}

export async function unlist(form: FormData) {
  const session = await getSession();
  if (!session) return;
  const id = Number(form.get("id"));
  if (getListing(id)?.owner_id !== session.ghId) return;
  deleteListing(id, session.ghId);
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
}
