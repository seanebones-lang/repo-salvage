"use server";
import { getSession } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  issueCredential,
  revokeCredential,
  dismissDraft,
} from "@/lib/contributions";
import { takeRequest } from "@/lib/db";
import { getOwnedPublicRepo } from "@/lib/github";
export type CredentialState = {
  token?: string;
  expires_at?: number;
  error?: string;
} | null;
export async function issue(
  _previous: CredentialState,
  form: FormData,
): Promise<CredentialState> {
  const session = await getSession();
  if (!session) return { error: "Sign in first." };
  const name = String(form.get("name") ?? "").trim();
  const hours = Number(form.get("hours"));
  const values = form.getAll("repoId");
  const ids = [...new Set(values.map(Number))];
  if (
    !name ||
    name.length > 80 ||
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > 168 ||
    ids.length < 1 ||
    ids.length > 20 ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 1)
  )
    return {
      error: "Choose a name, 1–20 repositories and a lifetime of 1–168 hours.",
    };
  if (!takeRequest(`agent:issue-verify:${session.ghId}`, 10, 60_000))
    return {
      error:
        "Credential verification allowance exhausted. Try again in a minute.",
    };
  try {
    // Recheck submitted IDs server-side; never trust the checkbox inventory.
    for (const id of ids) {
      const repo = await getOwnedPublicRepo(
        session.accessToken,
        id,
        session.login,
      );
      if (
        repo.owner.id !== session.ghId ||
        !repo.license?.spdx_id ||
        repo.license.spdx_id === "NOASSERTION"
      )
        return {
          error:
            "Every selected repository must be yours, public, non-fork and licensed.",
        };
    }
    const result = issueCredential(session.ghId, name, ids, hours);
    revalidatePath("/dashboard/agents");
    return { token: result.token, expires_at: result.credential.expires_at };
  } catch {
    return {
      error:
        "Could not create this credential. Check repository eligibility, active credential limits and GitHub availability.",
    };
  }
}
export async function revoke(form: FormData) {
  const session = await getSession();
  if (!session) return;
  revokeCredential(String(form.get("id") ?? ""), session.ghId);
  revalidatePath("/dashboard/agents");
}
export async function dismiss(form: FormData) {
  const session = await getSession();
  if (!session) return;
  dismissDraft(String(form.get("id") ?? ""), session.ghId);
  revalidatePath("/dashboard/agents");
}
