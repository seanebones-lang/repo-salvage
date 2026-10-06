import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getSession: vi.fn(), getOwnedPublicRepo: vi.fn(), resolveSourceCommit: vi.fn(),
  snapshotRepo: vi.fn(), lastHumanCommit: vi.fn(), isPublicRepo: vi.fn(), summarizeRepo: vi.fn(),
  takeSummaryRun: vi.fn(), upsertListing: vi.fn(), getListing: vi.fn(), deleteListing: vi.fn() }));
vi.mock("@/auth", () => ({ getSession: m.getSession }));
vi.mock("@/lib/github", () => m);
vi.mock("@/lib/summarize", () => ({ summarizeRepo: m.summarizeRepo }));
vi.mock("@/lib/db", () => m);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { salvage, unlist } from "@/app/dashboard/actions";
const sha = "a".repeat(40);
const repo = { id: 1, owner: { id: 42, login: "me" } };
const snap = { sourceSha: sha, knownPaths: ["x.ts"], tree: ["x.ts"], files: [{ path: "x.ts", content: "source" }] };
beforeEach(() => {
  vi.resetAllMocks();
  m.getSession.mockResolvedValue({ ghId: 42, login: "me", accessToken: "token" });
  m.getOwnedPublicRepo.mockResolvedValue(repo);
  m.resolveSourceCommit.mockResolvedValue(sha);
  m.snapshotRepo.mockResolvedValue(snap);
  m.lastHumanCommit.mockResolvedValue(null);
  m.isPublicRepo.mockResolvedValue(true);
  m.takeSummaryRun.mockReturnValue(true);
  m.summarizeRepo.mockResolvedValue({ summary: { overview: "x", reusable_pieces: [] }, model: "returned-model" });
});
const form = () => { const f = new FormData(); f.set("repoId", "1"); return f; };
describe("publication orchestration", () => {
  it("uses one resolved commit for sampling, history and saved provenance", async () => {
    expect(await salvage(null, form())).toHaveProperty("ok");
    expect(m.resolveSourceCommit).toHaveBeenCalledTimes(1);
    expect(m.snapshotRepo).toHaveBeenCalledWith("token", repo, sha);
    expect(m.lastHumanCommit).toHaveBeenCalledWith("token", repo, sha);
    expect(m.summarizeRepo).toHaveBeenCalledWith(repo, snap, null);
    expect(m.upsertListing).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 42, source_sha: sha, summary_model: "returned-model", analyzed_at: expect.any(String) }));
  });
  it("does not invoke the model when the public sample fails", async () => {
    m.snapshotRepo.mockRejectedValue(new Error("Unreadable sample"));
    expect(await salvage(null, form())).toEqual({ error: "Unreadable sample" });
    expect(m.summarizeRepo).not.toHaveBeenCalled();
    expect(m.upsertListing).not.toHaveBeenCalled();
  });
  it.each(["before", "after"])("stops publication when visibility changes %s the model call", async (when) => {
    if (when === "before") m.isPublicRepo.mockResolvedValue(false);
    else m.isPublicRepo.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await salvage(null, form())).toHaveProperty("error");
    expect(m.upsertListing).not.toHaveBeenCalled();
    if (when === "before") expect(m.summarizeRepo).not.toHaveBeenCalled();
  });
  it("removes stored listings without requiring GitHub inventory", async () => {
    m.getListing.mockReturnValue({ owner_id: 42 });
    const f = new FormData(); f.set("id", "7");
    await unlist(f);
    expect(m.deleteListing).toHaveBeenCalledWith(7, 42);
    expect(m.getOwnedPublicRepo).not.toHaveBeenCalled();
  });
});
