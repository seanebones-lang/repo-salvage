"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/auth";
import { deleteListing, getListing, takeSummaryRun, upsertListing } from "@/lib/db";
import { getOwnedPublicRepo, lastHumanCommit, snapshotRepo } from "@/lib/github";
import { summarizeRepo } from "@/lib/summarize";

export type ActionState = { error?: string; ok?: string } | null;

export async function salvage(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const repoId = Number(form.get("repoId"));
  const note = String(form.get("note") ?? "").trim().slice(0, 280) || null;
  if (!takeSummaryRun(session.ghId)) return { error: "Daily summary limit reached. Try again tomorrow." };
  try {
    const repo = await getOwnedPublicRepo(session.accessToken, repoId, session.login);
    const [snap, last] = await Promise.all([
      snapshotRepo(session.accessToken, repo),
      lastHumanCommit(session.accessToken, repo),
    ]);
    const summary = await summarizeRepo(repo, snap, note);
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
      license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : repo.license?.name ?? null,
      last_human_commit: last,
      owner_note: note,
      summary,
    });
    revalidatePath("/");
    revalidatePath("/dashboard");
    return { ok: `Listed ${repo.full_name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
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
