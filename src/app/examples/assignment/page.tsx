import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent reuse example · Repo Salvage",
  description:
    "A native agent discovers pinned Python source, preserves its notice and creates a tested standalone A/B assignment consumer.",
};

const source =
  "https://github.com/seanebones-lang/btcpredictor/blob/aaac31375effca4d862e719d90ac078b8fb7696b/btc_predictor/ab_testing.py";

export default function AssignmentExamplePage() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Agent reuse pilot · Python · MIT</span>
        <h1>From an agent’s search to a working consumer.</h1>
        <p className="lede">
          Given a repeatable A/B assignment task, a separate Codex host found a
          part, inspected its full source and made a standalone adaptation
          through Repo Salvage’s MCP tools.
        </p>
        <div className="hero-actions">
          <a
            className="button button-primary"
            href="/assignment-consumer.tar.gz"
            download
          >
            Download the working example <span aria-hidden="true">↗</span>
          </a>
          <Link className="button button-secondary" href="/agents">
            Connect your agent <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <div className="notice">
        This is one local host pilot and a reviewed example. Its results apply
        to the included adaptation; the upstream repository and your integration
        still need their own checks.
      </div>
      <div className="guide-steps">
        <section>
          <span className="step-number">01</span>
          <h2>Find the small routine.</h2>
          <p>
            The agent searched for assignment, inspected the candidate, and read
            the complete pinned Python file and discovered MIT notice. Four
            native MCP calls supplied the source and provenance.
          </p>
        </section>
        <section>
          <span className="step-number">02</span>
          <h2>Make the boundary explicit.</h2>
          <p>
            The routine lived inside an application class. Its tracker, data
            sources, prediction helpers and analysis dependencies were removed.
            The brief listed dependencies of the selected routine; the full file
            made the wider application boundary clear.
          </p>
        </section>
        <section>
          <span className="step-number">03</span>
          <h2>Test the adaptation.</h2>
          <p>
            The host’s extraction passed six tests. The reviewed consumer passes
            twelve checks, including fixed upstream assignments, fresh
            interpreters, invalid inputs and the floating-point edge at a full
            traffic split.
          </p>
        </section>
      </div>
      <section className="closing-note agent-commands">
        <span className="eyebrow">Python 3.9+ · standard library only</span>
        <h2>A stable choice for the same identifiers.</h2>
        <p>
          The split is the fraction assigned to B. Use string identifiers and a
          finite split between zero and one. The CLI prints A or B; the module
          can be imported into your own consumer.
        </p>
        <pre>
          <code>{`tar -xzf assignment-consumer.tar.gz\ncd assignment-consumer\npython3 -m unittest -v test_assignment.py\npython3 assignment.py checkout-v2 u-001 0.5`}</code>
        </pre>
        <p>
          The bundle includes source hashes, the original MIT notice, fixed
          acceptance vectors and all intentional changes. Review adds explicit
          zero/one endpoints and string input validation. Interior splits retain
          the observed upstream assignment rule.
        </p>
        <a className="text-link" href={source}>
          Inspect the pinned upstream source →
        </a>
      </section>
      <section className="closing-note">
        <span className="eyebrow">Evidence and limits</span>
        <h2>Keep the useful result in context.</h2>
        <p>
          The native connection was exercised with Codex CLI 0.160.0 and a
          freshly installed MCP archive. Ten separate read-only sessions also
          answered ten fixed catalog questions correctly. Those questions replay
          a frozen snapshot; they measure catalog retrieval for this host,
          without establishing performance on every model or a changing catalog.
        </p>
        <p>
          MD5 is used for non-security bucketing. The original colon-separated
          identifier convention is preserved, so some identifier pairs can share
          a bucket. The tests do not establish statistical quality, security or
          a component license audit. Preserve the included notice and verify the
          convention against your own requirements.
        </p>
        <Link className="text-link" href="/examples">
          Back to worked examples →
        </Link>
      </section>
    </>
  );
}
