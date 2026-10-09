import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exact integer formatter example",
  description:
    "An English integer formatter adapted from pinned Humanize evidence, with exact rounding, retained notices and standalone tests.",
};
const source =
  "https://github.com/python-humanize/humanize/blob/785e5dcc0d0308ad0dff3f6cc0faa7085ad0375b/src/humanize/number.py";

export default function IntegerExamplePage() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">
          A scoped-source adaptation · Python · MIT
        </span>
        <h1>A small formatter you can try for yourself.</h1>
        <p className="lede">
          A separate Codex session adapted a pinned Humanize function and its
          supporting magnitude tables into an English integer formatter. The
          first generated code passed its prewritten tests without edits.
        </p>
        <div className="hero-actions">
          <a
            className="button button-primary"
            href="/integer-word-consumer.tar.gz"
            download
          >
            Download the working example <span aria-hidden="true">↗</span>
          </a>
          <Link className="button button-secondary" href="/agents">
            Explore source with your agent <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <div className="notice">
        The tests apply to this narrower adaptation. The original module and
        your integration still need their own checks. This trial used a fixed
        evidence response; it did not search the live catalog.
      </div>
      <div className="guide-steps">
        <section>
          <span className="step-number">01</span>
          <h2>Read the supporting pieces.</h2>
          <p>
            The focused response supplied the complete function, magnitude
            thresholds, labels and notice. The larger containing module did not
            fit, and the response kept that omission visible.
          </p>
        </section>
        <section>
          <span className="step-number">02</span>
          <h2>Choose a clear contract.</h2>
          <p>
            This version accepts integers, uses English names and rounds exactly
            with integer arithmetic. Translation, locale state, floating-point
            inputs and custom format strings are outside its API.
          </p>
        </section>
        <section>
          <span className="step-number">03</span>
          <h2>Check the result in isolation.</h2>
          <p>
            Nine tests cover signs, input validation, decimal places, all
            supplied magnitudes, rounding carries and half-even ties. They
            include 1,500 seeded comparisons against a Decimal reference and
            values through 10 to the power of 200.
          </p>
        </section>
      </div>
      <section className="closing-note agent-commands">
        <span className="eyebrow">Python 3.9+ · standard library only</span>
        <h2>Exact numbers, readable names.</h2>
        <pre>
          <code>{`tar -xzf integer-word-consumer.tar.gz\ncd integer-word-consumer\npython3 -I -m unittest discover -s . -p test_consumer.py -v\npython3 -c 'from consumer import format_integer; print(format_integer(1234567, 3))'\n# 1.235 million`}</code>
        </pre>
        <p>
          Precision ranges from zero to six decimal places. Small integers
          retain their exact text; larger values use names from thousand through
          decillion, then googol. The bundle includes the complete MIT notice,
          source identity and all acceptance tests.
        </p>
        <a className="text-link" href={source}>
          Inspect the pinned upstream source →
        </a>
      </section>
      <section className="closing-note">
        <span className="eyebrow">Evidence and limits</span>
        <h2>Adaptation needs its own proof.</h2>
        <p>
          Supporting excerpts explain a useful component without proving that
          all of its dependencies are present. Here, the agent replaced the
          missing localization hooks with an explicit English-only API and used
          exact rounding. The upstream source was not executed. These results
          belong to one authored exercise, reviewed by the implementing
          operator.
        </p>
        <p>
          The formatter is a different API from Humanize. Its checks do not
          establish general discovery quality, certify the source repository or
          make a catalog part independently tested.
        </p>
        <Link className="text-link" href="/examples">
          Back to worked examples →
        </Link>
      </section>
    </>
  );
}
