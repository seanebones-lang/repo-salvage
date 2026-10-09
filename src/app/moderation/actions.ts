"use server";
import { getSession } from "@/auth";
import { isModerator } from "@/lib/moderation";
import { moderateReport } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function handleReport(form: FormData) {
  const session = await getSession();
  if (!session || !isModerator(session.ghId)) return;
  const action = form.get("action");
  const id = Number(form.get("reportId"));
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    (action !== "hide" && action !== "restore" && action !== "resolve")
  )
    return;
  if (moderateReport(id, action)) {
    revalidatePath("/", "layout");
    revalidatePath("/moderation");
  }
}
