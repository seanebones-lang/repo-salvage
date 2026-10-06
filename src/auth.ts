import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

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
      const s = session as typeof session & { login?: string; ghId?: number; accessToken?: string };
      s.login = token.login as string | undefined;
      s.ghId = token.ghId as number | undefined;
      s.accessToken = token.accessToken as string | undefined;
      return s;
    },
  },
});

export type SalvageSession = {
  login: string;
  ghId: number;
  accessToken: string;
} | null;

export async function getSession(): Promise<SalvageSession> {
  const s = (await auth()) as (Awaited<ReturnType<typeof auth>> & { login?: string; ghId?: number; accessToken?: string }) | null;
  if (!s?.login || !s.accessToken || !s.ghId) return null;
  return { login: s.login, ghId: s.ghId, accessToken: s.accessToken };
}
