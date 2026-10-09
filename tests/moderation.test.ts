import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isModerator } from "@/lib/moderation";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  moderateReport: vi.fn(),
  moderationReports: vi.fn(),
  unresolvedReportCount: vi.fn(),
}));
vi.mock("@/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => mocks);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import ModerationPage from "@/app/moderation/page";
import { handleReport } from "@/app/moderation/actions";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("moderator access", () => {
  it("has no moderator by default and requires an exact numeric GitHub identity", () => {
    vi.stubEnv("MODERATOR_GITHUB_IDS", "");
    expect(isModerator(42)).toBe(false);
    vi.stubEnv("MODERATOR_GITHUB_IDS", " 42, 99 ");
    expect(isModerator(42)).toBe(true);
    expect(isModerator(4)).toBe(false);
  });
  it("enforces authorization at the mutation boundary", async () => {
    vi.stubEnv("MODERATOR_GITHUB_IDS", "42");
    const form = new FormData();
    form.set("reportId", "7");
    form.set("action", "hide");
    mocks.getSession.mockResolvedValue({ ghId: 99 });
    await handleReport(form);
    expect(mocks.moderateReport).not.toHaveBeenCalled();
    mocks.getSession.mockResolvedValue({ ghId: 42 });
    await handleReport(form);
    expect(mocks.moderateReport).toHaveBeenCalledWith(7, "hide");
  });
});

it("clamps queue pagination and keeps older report controls reachable", async () => {
  vi.stubEnv("MODERATOR_GITHUB_IDS", "42");
  mocks.getSession.mockResolvedValue({ ghId: 42 });
  mocks.unresolvedReportCount.mockReturnValue(205);
  mocks.moderationReports.mockReturnValue([
    {
      id: 1,
      full_name: "me/oldest",
      reason: "Check license",
      at: "earlier",
      moderation_hidden_at: "now",
    },
  ]);
  const html = renderToStaticMarkup(
    await ModerationPage({ searchParams: Promise.resolve({ page: "999" }) }),
  );
  expect(mocks.moderationReports).toHaveBeenCalledWith(5);
  expect(html).toContain("Page 5 of 5");
  expect(html).toContain("Restore listing");
  expect(html).toContain("/moderation?page=4");
});
