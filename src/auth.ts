import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";

// Public-profile scope only. Public repo data is readable without extra scopes.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope: "read:user" } } })],
  callbacks: {
    jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.login = (profile as { login?: string } | undefined)?.login;
        token.ghId = (profile as { id?: number } | undefined)?.id;
      }
      return token;
    },
    session({ session, token }) {
      // Never copy the GitHub access token here: /api/auth/session returns this object to the browser.
      const s = session as typeof session & { login?: string; ghId?: number };
      s.login = token.login as string | undefined;
      s.ghId = token.ghId as number | undefined;
      return s;
    },
  },
});

export type SalvageSession = {
  login: string;
  ghId: number;
  accessToken: string;
} | null;

/** Signed-in user plus their GitHub token, read server-side from the encrypted JWT cookie. */
export async function getSession(): Promise<SalvageSession> {
  const s = (await auth()) as ({ login?: string; ghId?: number } & object) | null;
  if (!s?.login || !s.ghId) return null;
  const secure = process.env.NODE_ENV === "production";
  const token = await getToken({
    req: { headers: await headers() } as never,
    secret: process.env.AUTH_SECRET!,
    secureCookie: secure,
    salt: `${secure ? "__Secure-" : ""}authjs.session-token`,
  });
  const accessToken = token?.accessToken as string | undefined;
  if (!accessToken) return null;
  return { login: s.login, ghId: s.ghId, accessToken };
}
