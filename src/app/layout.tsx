import "./globals.css";
import Link from "next/link";
import { getSession } from "@/auth";
import { signIn, signOut } from "@/auth";

export const metadata = {
  title: "Repo Salvage",
  description: "Abandoned repos with reusable parts, listed by their authors.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">Repo Salvage</Link>
            <nav>
              {session ? (
                <>
                  <Link href="/dashboard">My repos</Link>
                  <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                    <button className="ghost">Sign out ({session.login})</button>
                  </form>
                </>
              ) : (
                <form action={async () => { "use server"; await signIn("github", { redirectTo: "/dashboard" }); }}>
                  <button>List your repos with GitHub</button>
                </form>
              )}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
