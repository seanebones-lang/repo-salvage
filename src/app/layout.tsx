import "./globals.css";
import Link from "next/link";
import { getSession } from "@/auth";
import { signIn, signOut } from "@/auth";
import { Icon } from "@/components/icon";
import { isModerator } from "@/lib/moderation";

export const metadata = {
  title: {
    default: "Repo Salvage — Good code deserves a second life",
    template: "%s · Repo Salvage",
  },
  description:
    "Find reusable components in author-nominated projects, with source links, dependencies, integration guidance and clear evidence.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">
              <span className="brand-mark">
                <Icon name="box" size={23} />
              </span>
              <span>
                repo<span className="brand-light">salvage</span>
                <span className="brand-period">.</span>
              </span>
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/#catalog">The catalog</Link>
              <Link href="/how-it-works">How it works</Link>
              {session ? (
                <>
                  <Link href="/dashboard">My projects</Link>
                  {isModerator(session.ghId) && (
                    <Link href="/moderation">Reports</Link>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button className="button button-secondary button-small">
                      Sign out <span className="sr-only">{session.login}</span>
                    </button>
                  </form>
                </>
              ) : process.env.AUTH_GITHUB_ID &&
                process.env.AUTH_GITHUB_SECRET ? (
                <form
                  action={async () => {
                    "use server";
                    await signIn("github", { redirectTo: "/dashboard" });
                  }}
                >
                  <button className="button button-dark button-small">
                    Share a project <Icon name="arrow" size={15} />
                  </button>
                </form>
              ) : (
                <Link
                  className="button button-dark button-small"
                  href="/dashboard"
                >
                  Share a project <Icon name="arrow" size={15} />
                </Link>
              )}
            </nav>
          </header>
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div>
              <Link href="/" className="brand footer-brand">
                reposalvage<span className="brand-period">.</span>
              </Link>
              <p>Useful work deserves another chapter.</p>
            </div>
            <div className="footer-links">
              <Link href="/how-it-works">Field guide</Link>
              <Link href="/examples">Worked examples</Link>
              <Link href="/agents">For agents</Link>
              <a
                href="https://github.com/seanebones-lang/repo-salvage"
                target="_blank"
                rel="noreferrer"
              >
                Source on GitHub <Icon name="external" size={13} />
              </a>
            </div>
            <p className="footer-note">
              Inspect the evidence. Read the source. Test your adaptation.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
