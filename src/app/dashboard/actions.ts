"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/auth";
import {
  deleteListing,
  getListing,
  takeSummaryRun,
  upsertListing,
  reviewComponent,
} from "@/lib/db";
import {
  getOwnedPublicRepo,
  lastHumanCommit,
  snapshotRepo,
  resolveSourceCommit,
  isPublicRepoFresh,
} from "@/lib/github";
import { summarizeRepo } from "@/lib/summarize";

export type ActionState = { error?: string; ok?: string } | null;

export async function salvage(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const repoId = Number(form.get("repoId"));
  if (!Number.isSafeInteger(repoId) || repoId < 1)
    return { error: "Choose a valid repository." };
  const note =
    String(form.get("note") ?? "")
      .trim()
      .slice(0, 280) || null;
  try {
    const repo = await getOwnedPublicRepo(
      session.accessToken,
      repoId,
      session.login,
    );
    if (!repo.license?.spdx_id || repo.license.spdx_id === "NOASSERTION") {
      return {
        error:
          "Add a recognized license to the repository before listing it for reuse. GitHub must identify its SPDX license.",
      };
    }
    if (!takeSummaryRun(session.ghId))
      return {
        error:
          "The daily analysis allowance is exhausted for your account or this installation. Try again tomorrow.",
      };
    const sourceSha = await resolveSourceCommit(session.accessToken, repo);
    const [snap, last] = await Promise.all([
      snapshotRepo(session.accessToken, repo, sourceSha),
      lastHumanCommit(session.accessToken, repo, sourceSha),
    ]);
    if (!(await isPublicRepoFresh(repo.id, session.ghId)))
      throw new Error("Repository is no longer public or owned by you");
    const { summary, model } = await summarizeRepo(repo, snap, note);
    if (!(await isPublicRepoFresh(repo.id, session.ghId)))
      throw new Error("Repository is no longer public or owned by you");
    upsertListing({
      github_repo_id: repo.id,
      owner_login: repo.owner.login,
      owner_id: session.ghId,
      name: repo.name,
      full_name: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      license:
        repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION"
          ? repo.license.spdx_id
          : (repo.license?.name ?? null),
      last_human_commit: last,
      owner_note: note,
      summary,
      source_sha: sourceSha,
      analyzed_at: new Date().toISOString(),
      summary_model: model,
    });
    revalidatePath("/");
    revalidatePath("/dashboard");
    return { ok: `Listed ${repo.full_name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
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
  revalidatePath("/");
  revalidatePath("/dashboard");
}
