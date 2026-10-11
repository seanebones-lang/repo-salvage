import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import { Auth } from "@auth/core";
import { encode } from "@auth/core/jwt";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  headers: vi.fn(),
  config: {} as NextAuthConfig,
}));
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return {
      auth: mocks.auth,
      handlers: {},
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { getSession } from "@/auth";
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
describe("server-side session token boundary", () => {
  it("does not read an existing session or provider token in demo mode", async () => {
    vi.stubEnv("REPO_SALVAGE_DEMO", "1");
    try {
      mocks.auth.mockResolvedValue({ login: "author", ghId: 42 });
      expect(await getSession()).toBeNull();
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
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
  it.each([
    0,
    Date.now() / 1000 - 1,
    Date.now() / 1000 + 30,
    "tomorrow",
    null,
    NaN,
    Infinity,
  ])(
    "refuses expired, near-expiry or malformed provider expiry: %s",
    async (expiry) => {
      mocks.auth.mockResolvedValue({ login: "author", ghId: 42 });
      mocks.headers.mockResolvedValue(new Headers());
      mocks.token.mockResolvedValue({
        login: "author",
        ghId: 42,
        accessToken: "private",
        accessTokenExpiresAt: expiry,
      });
      expect(await getSession()).toBeNull();
    },
  );
  it("accepts a provider token with time remaining", async () => {
    mocks.auth.mockResolvedValue({ login: "author", ghId: 42 });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.token.mockResolvedValue({
      login: "author",
      ghId: 42,
      accessToken: "private",
      accessTokenExpiresAt: Date.now() / 1000 + 300,
    });
    expect(await getSession()).toEqual({
      login: "author",
      ghId: 42,
      accessToken: "private",
    });
  });
});

describe("GitHub OAuth session lifetime", () => {
  it.each([true, false])(
    "validates a real encrypted Auth.js session cookie (provider token usable: %s)",
    async (usable) => {
      const secret = "test-only-session-secret-with-sufficient-length";
      const encrypted = await encode({
        secret,
        salt: "authjs.session-token",
        token: {
          login: "author",
          ghId: 42,
          accessToken: "private-provider-token",
          accessTokenExpiresAt: Date.now() / 1000 + (usable ? 300 : -1),
        },
      });
      const response = await Auth(
        new Request("http://localhost:3000/api/auth/session", {
          headers: { cookie: `authjs.session-token=${encrypted}` },
        }),
        { ...mocks.config, basePath: "/api/auth", secret, trustHost: true },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      if (usable) {
        expect(body).toMatchObject({ login: "author", ghId: 42 });
        expect(JSON.stringify(body)).not.toContain("private-provider-token");
        expect(body).not.toHaveProperty("accessTokenExpiresAt");
      } else {
        expect(body).toBeNull();
        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
      }
    },
  );
  it("records GitHub expiry and ends the session before the token expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    const expiresAt = Date.now() / 1000 + 28800;
    const jwt = mocks.config.callbacks!.jwt!;
    const token = await jwt({
      token: {},
      account: {
        access_token: "private",
        refresh_token: "never-retain",
        expires_at: expiresAt,
      },
      profile: { login: "author", id: 42 },
    } as never);
    expect(token).toMatchObject({
      accessToken: "private",
      accessTokenExpiresAt: expiresAt,
      login: "author",
      ghId: 42,
    });
    expect(token).not.toHaveProperty("refresh_token");
    vi.setSystemTime(new Date((expiresAt - 60) * 1000));
    expect(await jwt({ token } as never)).toBeNull();
  });
  it.each([0, "tomorrow", null, NaN, Infinity])(
    "rejects malformed expiry at sign-in: %s",
    async (expiry) => {
      expect(
        await mocks.config.callbacks!.jwt!({
          token: {},
          account: { access_token: "private", expires_at: expiry },
          profile: { login: "author", id: 42 },
        } as never),
      ).toBeNull();
    },
  );
  it("replaces an expired token on re-authentication, including switching to a legacy app", async () => {
    const token = await mocks.config.callbacks!.jwt!({
      token: { accessToken: "old", accessTokenExpiresAt: 0 },
      account: { access_token: "new" },
      profile: { login: "author", id: 42 },
    } as never);
    expect(token).toMatchObject({
      accessToken: "new",
      login: "author",
      ghId: 42,
    });
    expect(token!.accessTokenExpiresAt).toBeUndefined();
  });
  it("exposes identity without access tokens or refresh tokens in the public session", async () => {
    const session = await mocks.config.callbacks!.session!({
      session: { user: { name: "Author" }, expires: "tomorrow" },
      token: {
        login: "author",
        ghId: 42,
        accessToken: "private",
        accessTokenExpiresAt: 123,
        refresh_token: "private-refresh",
      },
    } as never);
    expect(session).toEqual({
      user: { name: "Author" },
      expires: "tomorrow",
      login: "author",
      ghId: 42,
    });
  });
});
