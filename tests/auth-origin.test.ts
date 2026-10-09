import { afterEach, expect, it, vi } from "vitest";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { NextRequest } from "next/server";
// @ts-expect-error Next.js loads the JavaScript config without a TS declaration.
import nextConfig from "../next.config.mjs";

afterEach(() => vi.unstubAllEnvs());

it.each([
  "http://127.0.0.1:3187",
  "http://localhost:3000",
  "https://salvage.example.com",
])("retains the canonical OAuth callback origin: %s", async (origin) => {
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("AUTH_SECRET", "test-only-secret-with-sufficient-length");
  vi.stubEnv(
    "__NEXT_NO_MIDDLEWARE_URL_NORMALIZE",
    nextConfig.skipMiddlewareUrlNormalize ? "1" : undefined,
  );
  const { handlers } = NextAuth({
    providers: [GitHub({ clientId: "test-id", clientSecret: "test-secret" })],
  });
  const response = await handlers.GET(
    new NextRequest("http://127.0.0.1:3187/api/auth/providers", {
      headers: { "x-forwarded-host": "untrusted.example.com" },
    }),
  );
  expect(response.status).toBe(200);
  const providers = await response.json();
  expect(providers.github.callbackUrl).toBe(
    `${origin}/api/auth/callback/github`,
  );
  expect(providers.github.signinUrl).toBe(`${origin}/api/auth/signin/github`);
});
