import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadSuite,
  loadGenerated,
  verifySeal,
  read,
  directory,
  sha256,
} from "../examples/cross-language-evaluation/suite.mjs";
import { loadEngine } from "../examples/cross-language-evaluation/engine.mjs";
import { scoreCase } from "../examples/competing-discovery-evaluation/score.mjs";
test("four fresh source captures retain complete blobs, notices and unhinted production requests", async () => {
  const s = await loadSuite();
  assert.equal(s.analyses.length, 4);
  assert.equal(
    new Set(s.corpus.repositories.map((r) => r.metadata.language)).size,
    4,
  );
  for (const a of s.analyses) {
    assert.equal(JSON.parse(a.request.input).owner_context, null);
    assert.ok(!a.request.input.includes("expectedAnswer"));
    assert.ok(!a.request.input.includes("reviewRequirements"));
    assert.equal(a.packet.selection_policy, "repo-salvage/coverage-v4");
  }
  for (const r of s.corpus.repositories) {
    assert.ok(r.files.some((f) => /license/i.test(f.path)));
    assert.ok(r.inspection.initial_paths.length);
  }
  const rust = s.analyses.find((a) => a.repository === "rapidfuzz/strsim-rs");
  assert.ok(
    rust.packet.targets.some(
      (t) => t.path === "src/lib.rs" && t.kind === "file",
    ),
  );
  assert.ok(rust.packet.targets.every((t) => t.symbol === "<module>"));
});
test("unedited native summaries replay and remain the only catalog briefs", async () => {
  const s = await loadGenerated(),
    e = await loadEngine({ historical: true });
  try {
    for (const a of s.analyses) {
      const r = s.analysis.results.find((r) => r.repository === a.repository);
      assert.equal(r.transportSuccess, true);
      assert.equal(r.structurallyAccepted, true);
      assert.deepEqual(r.prohibitedEvents, []);
      const summary = e.verifiedIndexedSummary(
        JSON.stringify(r.response),
        a.index,
        a.packet,
      );
      assert.deepEqual(summary, r.summary);
      assert.deepEqual(
        JSON.parse(
          s.listings.find((l) => l.full_name === a.repository).summary_json,
        ),
        summary,
      );
      assert.equal(r.manualReview, "pending");
    }
  } finally {
    await e.close();
  }
  assert.equal(s.catalog.pagination.total, 10);
});
test("discovery tool responses replay the pre-frozen source and notice score", async () => {
  const s = await loadGenerated();
  await verifySeal("results-seal.json");
  const record = await read("discovery-results.json"),
    evidence = await read("discovery-evidence.json");
  assert.equal(record.results.length, 6);
  assert.equal(record.suiteSealSha256, sha256(s.sealBytes));
  for (const c of s.suite.cases) {
    const r = record.results.find((r) => r.id === c.id),
      trace = evidence.cases.find((r) => r.id === c.id);
    assert.equal(trace.traceSha256, r.trace.sha256);
    assert.deepEqual(r.prohibited, []);
    assert.deepEqual(
      scoreCase(
        r.answer,
        { transportSuccess: r.transportSuccess, calls: trace.calls },
        c,
        s.controls,
      ),
      r.score,
    );
  }
  const first = s.suite.cases[0],
    r = record.results.find((r) => r.id === first.id),
    trace = evidence.cases.find((r) => r.id === first.id);
  assert.equal(
    scoreCase(
      r.answer,
      {
        transportSuccess: true,
        calls: trace.calls.filter(
          (c) => c.tool === "repo_salvage_search_parts",
        ),
      },
      first,
      s.controls,
    ).sourceEvidence,
    false,
  );
  const altered = structuredClone(trace.calls);
  for (const c of altered)
    if (
      c.tool === "repo_salvage_read_part_file" &&
      c.result.structured_content?.file?.path === "src/index.js"
    )
      c.result.structured_content.file.sha256 = "0".repeat(64);
  // No focus was used for this short-source trial; a false whole-file hash fails.
  assert.equal(
    scoreCase(
      r.answer,
      { transportSuccess: true, calls: altered },
      first,
      s.controls,
    ).sourceEvidence,
    false,
  );
});
test("separate implementing review records source-specific behavior and boundaries", async () => {
  const review = await read("review.json");
  assert.equal(review.independent, false);
  assert.equal(review.analysis.length, 4);
  assert.equal(review.discovery.length, 6);
  assert.ok(
    review.analysis
      .find((r) => r.repository === "dgryski/go-rendezvous")
      .notes.includes("out-of-range"),
  );
  assert.ok(review.discovery.every((r) => typeof r.passed === "boolean"));
});
test("exact first adapted consumer retains the original notice and passes isolated acceptance", async () => {
  await verifySeal("consumer-input-seal.json");
  await verifySeal("consumer-results-seal.json");
  const r = await read("consumer-results.json"),
    execution = await read("consumer-execution.json"),
    code = await fs.readFile(path.join(directory, "consumer.mjs"), "utf8");
  assert.equal(r.response.code, code);
  assert.equal(r.execution, "not_run");
  assert.equal(r.manualReview, "pending");
  assert.equal(execution.codeSha256, sha256(code));
  assert.equal(execution.passed, true);
  const check = spawnSync(
    process.execPath,
    [path.join(directory, "check-consumer.mjs"), "--check"],
    { encoding: "utf8", timeout: 20000 },
  );
  assert.equal(check.status, 0, check.stderr + check.stdout);
});
test("operator commands reject implicit model usage and completed-epoch overwrites", () => {
  for (const args of [
    [],
    ["--analyze", "unused", "low"],
    ["--discover", "http://127.0.0.1:3192", "unused", "low"],
  ]) {
    const r = spawnSync(
      process.execPath,
      [path.join(directory, "run.mjs"), ...args],
      { encoding: "utf8", env: {}, timeout: 10000 },
    );
    assert.notEqual(r.status, 0);
    assert.match(
      r.stderr,
      args.length ? /already has results/ : /Explicit account use/,
    );
  }
});
