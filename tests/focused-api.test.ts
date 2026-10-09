import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import Ajv from "ajv/dist/2020";
import type { Listing } from "@/lib/db";
import { exampleListing } from "@/lib/examples";
const state = vi.hoisted(() => ({
  listing: vi.fn(),
  current: vi.fn(),
  fresh: vi.fn(),
  load: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("@/lib/public-listings", () => ({ getPublicListing: state.listing }));
vi.mock("@/lib/db", () => ({
  getListing: state.current,
  takeRequest: vi.fn(),
}));
vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  getPublicOwnedRepoFresh: state.fresh,
}));
vi.mock("@/lib/focused-evidence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/focused-evidence")>()),
  createEvidenceCache: () => state.load,
}));
vi.mock("@/lib/agent-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-api")>()),
  reserveAgentRead: state.reserve,
}));
import { GET } from "@/app/api/v2/parts/[id]/evidence/route";
const packets = JSON.parse(
  fs.readFileSync("examples/focused-evidence/fixtures/packets.json", "utf8"),
);
const sample = packets.cases[0].response;
const check = new Ajv({ strict: false }).compile(
  JSON.parse(fs.readFileSync("public/openapi.json", "utf8")).components.schemas
    .FocusedEvidence,
);
let listing: Listing;
const request = (
  q = `path=${sample.focus.path}&symbol=${sample.focus.symbol}&max_characters=24000`,
) =>
  new Request(
    `http://localhost/api/v2/parts/${sample.listing_id}/evidence?${q}`,
  );
const context = (id = String(sample.listing_id)) => ({
  params: Promise.resolve({ id }),
});
beforeEach(() => {
  vi.clearAllMocks();
  listing = {
    ...exampleListing,
    id: sample.listing_id,
    github_repo_id: sample.source.repository_id,
    owner_id: sample.source.owner_id,
    full_name: sample.source.repository,
    source_sha: sample.source.commit,
    analyzed_at: "2026-10-09T00:00:00Z",
    moderation_hidden_at: null,
  };
  state.listing.mockResolvedValue(listing);
  state.current.mockReturnValue(listing);
  state.fresh.mockResolvedValue({ full_name: listing.full_name });
  state.load.mockResolvedValue({
    focus: sample.focus,
    coverage: sample.coverage,
    packet: sample.packet,
  });
  state.reserve.mockImplementation(() => {});
});
describe("public focused source boundary", () => {
  it("returns the strict contract and no-store headers without publication or generation", async () => {
    const response = await GET(request(), context());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(check(body), JSON.stringify(check.errors)).toBe(true);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.fresh).toHaveBeenCalledWith(
      listing.github_repo_id,
      listing.owner_id,
    );
    expect(body.interpretation).toBe("none");
  });
  it("rejects invalid query and identity before reserving or looking up a repository", async () => {
    expect((await GET(request("path=../secret"), context())).status).toBe(400);
    expect((await GET(request(), context("01"))).status).toBe(400);
    expect(state.reserve).not.toHaveBeenCalled();
    expect(state.listing).not.toHaveBeenCalled();
    expect(state.load).not.toHaveBeenCalled();
  });
  it("withholds hidden or unpinned inventory before inspecting source", async () => {
    state.listing.mockResolvedValueOnce(null);
    expect((await GET(request(), context())).status).toBe(404);
    state.listing.mockResolvedValueOnce({ ...listing, source_sha: null });
    expect((await GET(request(), context())).status).toBe(409);
    expect(state.load).not.toHaveBeenCalled();
  });
  it("withholds completed and cached data on fresh public verification failure", async () => {
    state.fresh.mockRejectedValueOnce(Error("private/ownership/unavailable"));
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("temporarily_unavailable");
    expect(body).not.toHaveProperty("packet");
  });
  it.each(["hide", "remove", "owner", "repo", "commit", "analysis", "rename"])(
    "rechecks %s changes after asynchronous inspection",
    async (kind) => {
      state.load.mockImplementationOnce(async () => {
        state.current.mockReturnValue(
          kind === "remove"
            ? null
            : {
                ...listing,
                ...(kind === "hide"
                  ? { moderation_hidden_at: "now" }
                  : kind === "owner"
                    ? { owner_id: listing.owner_id + 1 }
                    : kind === "repo"
                      ? { github_repo_id: listing.github_repo_id + 1 }
                      : kind === "commit"
                        ? { source_sha: "b".repeat(40) }
                        : kind === "analysis"
                          ? { analyzed_at: "later" }
                          : {}),
              },
        );
        if (kind === "rename")
          state.fresh.mockResolvedValue({ full_name: "new/name" });
        return {
          focus: sample.focus,
          coverage: sample.coverage,
          packet: sample.packet,
        };
      });
      const response = await GET(request(), context());
      expect(response.status).toBe(
        ["commit", "analysis", "rename"].includes(kind) ? 409 : 404,
      );
      expect(await response.json()).not.toHaveProperty("packet");
    },
  );
});
