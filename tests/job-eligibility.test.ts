import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicOwnedRepoFresh } from "@/lib/github";
const json = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("background repository eligibility", () => {
  const eligible = {
    id: 7,
    private: false,
    fork: false,
    owner: { id: 42 },
    license: { spdx_id: "MIT" },
  };
  it("rechecks numeric identity anonymously with no cached visibility", async () => {
    const fetch = vi.fn(async () => json(eligible));
    vi.stubGlobal("fetch", fetch);
    await getPublicOwnedRepoFresh(7, 42);
    await getPublicOwnedRepoFresh(7, 42);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]).toEqual([
      "https://api.github.com/repositories/7",
      expect.objectContaining({ cache: "no-store" }),
    ]);
  });
  it.each([
    { private: true },
    { id: 8 },
    { owner: { id: 99 } },
    { fork: true },
    { fork: undefined },
    { license: null },
    { license: { spdx_id: "NOASSERTION" } },
  ])("rejects changed eligibility: %j", async (change) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ...eligible, ...change })),
    );
    await expect(getPublicOwnedRepoFresh(7, 42)).rejects.toThrow(/eligibility/);
  });
});
