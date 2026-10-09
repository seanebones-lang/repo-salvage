"use client";
import Link from "next/link";

export default function ErrorPage() {
  return (
    <div className="empty-state">
      <h1>We couldn’t load this page.</h1>
      <p>
        Try again. If the problem continues, you can still inspect the project’s
        source on GitHub.
      </p>
      <div className="form-row">
        <button
          onClick={() => window.location.reload()}
          className="button button-primary"
        >
          Try again
        </button>
        <Link href="/" className="button button-secondary">
          Back to the catalog
        </Link>
      </div>
    </div>
  );
}
