import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("next-auth", () => ({
  default: () => ({
    auth: mocks.auth,
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { getSession } from "@/auth";
afterEach(() => vi.resetAllMocks());
describe("server-side session token boundary", () => {
  it.each([
    ["authjs.session-token=encrypted", false],
    ["__Secure-authjs.session-token.0=encrypted", true],
  ])(
    "reads the correct cookie for HTTP and HTTPS: %s",
    async (cookie, secureCookie) => {
      mocks.auth.mockResolvedValue({ login: "author", ghId: 42 });
      mocks.headers.mockResolvedValue(new Headers({ cookie }));
      mocks.token.mockResolvedValue({
        login: "author",
        ghId: 42,
        accessToken: "server-only",
      });
      expect(await getSession()).toEqual({
        login: "author",
        ghId: 42,
        accessToken: "server-only",
      });
      expect(mocks.token).toHaveBeenCalledWith(
        expect.objectContaining({ secureCookie }),
      );
    },
  );
  it("refuses a decrypted token that does not match the authenticated session", async () => {
    mocks.auth.mockResolvedValue({ login: "author", ghId: 42 });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.token.mockResolvedValue({
      login: "someone-else",
      ghId: 99,
      accessToken: "server-only",
    });
    expect(await getSession()).toBeNull();
  });
});
