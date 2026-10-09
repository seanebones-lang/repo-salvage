import Link from "next/link";
import { exampleListing, testedExampleId } from "@/lib/examples";
import { componentsOf } from "@/lib/components";
import { PartCard } from "@/components/part-card";

export default function ExamplesPage() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">A complete worked example</span>
        <h1>Start with something real.</h1>
        <p className="lede">
          Three parts from Repo Salvage itself, curated against a specific
          source commit. One includes a standalone adaptation and consumer
          tests.
        </p>
      </div>
      <div className="notice">
        These examples explain the workflow. They are not owner-submitted
        listings, usage claims, or a certification of the source repository.
      </div>
      <div className="parts-grid">
        {componentsOf([exampleListing]).map((entry) => (
          <PartCard
            key={entry.id}
            entry={entry}
            example
            tested={entry.id === testedExampleId}
          />
        ))}
      </div>
      <section className="closing-note">
        <span className="eyebrow">A native agent reuse pilot</span>
        <h2>Let an agent make the connection.</h2>
        <p>
          A separate Codex host used MCP to discover a Python assignment
          routine, read its complete source and notice, and produce a standalone
          consumer. The reviewed example includes twelve behavior checks and
          explicit adaptations.
        </p>
        <Link href="/examples/assignment" className="text-link">
          Explore the agent-produced adaptation →
        </Link>
      </section>
      <section className="closing-note">
        <span className="eyebrow">A scoped-source adaptation</span>
        <h2>Turn supporting evidence into a useful tool.</h2>
        <p>
          A focused Humanize response supplied a formatter and its magnitude
          tables while keeping missing module context visible. A separate agent
          produced an English integer adaptation with exact rounding; its
          unchanged code passed nine tests and 1,500 Decimal comparisons.
        </p>
        <Link href="/examples/integer" className="text-link">
          Try the exact integer formatter →
        </Link>
      </section>
      <section className="closing-note">
        <span className="eyebrow">The useful outcome</span>
        <h2>A part that earns its place in your project.</h2>
        <p>
          The parser example includes its source provenance, explicit
          adaptations, an MIT notice and an executable consumer test. The other
          two briefs remain candidates for inspection.
        </p>
        <Link href="/how-it-works" className="text-link">
          Understand the evidence labels →
        </Link>
      </section>
    </>
  );
}
