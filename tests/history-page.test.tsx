import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ signedIn: true, owner: 42 }));
vi.mock("@/auth", () => ({
  getSession: async () => (state.signedIn ? { ghId: 42 } : null),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/lib/db", () => ({
  getListing: () => ({
    id: 7,
    owner_id: state.owner,
    full_name: "author/parser",
  }),
  analysisHistory: vi.fn(() => [
    {
      revision_id: "revision",
      source_sha: "a".repeat(40),
      analyzed_at: "2026-10-09",
      summary_model: "fixture",
      recorded_at: "2026-10-09",
      summary_json: JSON.stringify({
        overview: "Prior <script>description</script>",
        reusable_pieces: [
          {
            name: "Parser",
            path: "parser.ts",
            description: "Splits text",
            owner_reviewed_at: "2026-10-09",
          },
        ],
      }),
    },
  ]),
}));
import History from "@/app/dashboard/history/[id]/page";
import { analysisHistory } from "@/lib/db";
beforeEach(() => {
  state.signedIn = true;
  state.owner = 42;
  vi.clearAllMocks();
});
it("requires login before reading private history", async () => {
  state.signedIn = false;
  await expect(
    History({ params: Promise.resolve({ id: "7" }) }),
  ).rejects.toThrow("redirect:/api/auth/signin");
  expect(analysisHistory).not.toHaveBeenCalled();
});
it("rejects invalid IDs and another owner's listing without reading its history", async () => {
  await expect(
    History({ params: Promise.resolve({ id: "7junk" }) }),
  ).rejects.toThrow("not-found");
  state.owner = 99;
  await expect(
    History({ params: Promise.resolve({ id: "7" }) }),
  ).rejects.toThrow("not-found");
  expect(analysisHistory).not.toHaveBeenCalled();
});
it("renders recorded source and review evidence for the owner with escaped prose", async () => {
  const html = renderToStaticMarkup(
    await History({ params: Promise.resolve({ id: "7" }) }),
  );
  expect(analysisHistory).toHaveBeenCalledWith(7, 42);
  expect(html).toContain("1 owner reviews recorded");
  expect(html).toContain("Prior &lt;script&gt;description&lt;/script&gt;");
  expect(html).toContain("a".repeat(40));
});
