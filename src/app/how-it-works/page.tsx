import Link from "next/link";
import { Icon } from "@/components/icon";

export default function HowItWorks() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">The salvage field guide</span>
        <h1>Keep the useful work moving.</h1>
        <p className="lede">
          A project can stop evolving while a small piece of it still solves a
          problem. Repo Salvage helps you find that piece and understand what
          taking it involves.
        </p>
      </div>
      <div className="guide-steps">
        <section>
          <span className="step-number">01</span>
          <Icon name="branch" size={28} />
          <h2>The author opens the door</h2>
          <p>
            Authors choose public repositories they own and add a note about
            what is worth keeping. A recognized repository license is required
            for a new listing. There is no project transfer or promise of
            continuing support.
          </p>
        </section>
        <section>
          <span className="step-number">02</span>
          <Icon name="code" size={28} />
          <h2>The useful parts get a brief</h2>
          <p>
            Complete source files are indexed within explicit limits at one
            commit. A model interprets the supplied evidence. Each candidate
            gets source links, observed dependencies, integration guidance and
            limitations. Primary source paths must have been inspected;
            supporting paths must exist in the source tree. An analysis may find
            no suitable parts.
          </p>
        </section>
        <section>
          <span className="step-number">03</span>
          <Icon name="box" size={28} />
          <h2>You evaluate and adapt</h2>
          <p>
            Inspect the source, follow imports, check license notices and test
            the part in your own project. Download the reuse brief to keep the
            evidence together. The worked parser example shows an independently
            tested adaptation.
          </p>
        </section>
      </div>
      <section className="detail-section guide-evidence">
        <span className="eyebrow">Evidence has levels</span>
        <h2>Read the label before relying on the part.</h2>
        <div className="evidence-grid">
          <div>
            <span className="evidence">
              <span className="status-dot" />
              Source sampled
            </span>
            <p>
              Source from the primary file was supplied to the analysis. Earlier
              briefs may have prefix or unknown sample coverage.
            </p>
          </div>
          <div>
            <span className="evidence">
              <span className="status-dot" />
              Complete declaration inspected
            </span>
            <p>
              A complete JS/TS implementation was parsed and supplied with
              source references. The explanation remains a model interpretation;
              inspect helpers and runtime dependencies before extraction.
            </p>
          </div>
          <div>
            <span className="evidence">
              <span className="status-dot" />
              Owner reviewed
            </span>
            <p>
              The author confirmed the brief for this analysis. Re-summarizing
              removes that confirmation.
            </p>
          </div>
          <div>
            <span className="evidence evidence-good">
              <span className="status-dot" />
              Example adaptation tested
            </span>
            <p>
              The included example runs in isolation with consumer tests.
              Catalog components have no independent test certification.
            </p>
          </div>
        </div>
      </section>
      <section className="closing-note">
        <h2>Have a project with something worth keeping?</h2>
        <p>
          You can list a young project, a mature utility, or a prototype you
          have moved on from. Activity dates provide context; inactivity is not
          a measure of quality.
        </p>
        <Link className="button button-primary" href="/dashboard">
          Share useful parts <Icon name="arrow" />
        </Link>
        <Link href="/examples" className="text-link">
          Explore the worked examples <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
