import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadSuite,
  read,
  directory,
  sha256,
} from "../examples/scoped-context-evaluation/suite.mjs";
import { loadEngine } from "../examples/scoped-context-evaluation/engine.mjs";
import { scoreSelection } from "../examples/scoped-context-evaluation/score.mjs";
import { focusedFixture } from "../examples/scoped-context-evaluation/focus-fixture.mjs";
test("scoped requests, complete Git blobs and pre-run support controls remain frozen", async () => {
  const s = await loadSuite();
  assert.equal(s.cases.length, 2);
  assert.equal(s.corpus.repositories.length, 2);
  const coverage = await read("coverage.json");
  assert.ok(coverage.every((c) => c.primaryUnchanged));
  for (const c of s.cases) {
    assert.ok(JSON.stringify(c.packet).length <= c.packetCharacters);
    assert.equal(JSON.parse(c.request.input).owner_context, null);
    assert.ok(!c.request.input.includes("requiredCitations"));
    assert.ok(!c.request.input.includes("reviewPoints"));
    assert.equal(c.packet.selection_policy, "repo-salvage/coverage-v4");
  }
});
test("exact native responses and manual reviews replay through the trusted archived engine without model calls", async () => {
  const suite = await loadSuite(),
    results = await read("results.json"),
    seal = await read("results-seal.json"),
    review = await read("review.json");
  const input = sha256(await fs.readFile(path.join(directory, "seal.json")));
  assert.equal(input, seal.inputSealSha256);
  assert.equal(input, results.inputSealSha256);
  assert.equal(input, review.inputSealSha256);
  for (const [name, digest] of Object.entries(seal.files))
    assert.equal(sha256(await fs.readFile(path.join(directory, name))), digest);
  assert.equal(results.results.length, suite.cases.length);
  const e = await loadEngine({ historical: true });
  try {
    for (const c of suite.cases) {
      const r = results.results.find((r) => r.id === c.id);
      assert.equal(r.transportSuccess, true);
      assert.equal(r.structurallyAccepted, true);
      assert.deepEqual(r.prohibitedEvents, []);
      assert.equal(r.requestSha256, c.requestSha256);
      const summary = e.verifiedIndexedSummary(
        JSON.stringify(r.response),
        c.index,
        c.packet,
      );
      assert.deepEqual(summary, r.summary);
      assert.deepEqual(scoreSelection(summary, c, c.packet), r.selection);
      assert.equal(r.selection.passed, true);
      assert.equal(r.selection.fullModuleSupplied, false);
      assert.equal(r.manualReview, "pending");
      assert.equal(review.cases.find((r) => r.id === c.id).passed, true);
    }
  } finally {
    await e.close();
  }
});
test("selected primary alone cannot satisfy the frozen supporting-citation gate", async () => {
  const suite = await loadSuite(),
    c = suite.cases[0],
    results = await read("results.json"),
    summary = structuredClone(results.results[0].summary);
  const p = summary.reusable_pieces.find(
    (p) => p.source_target.symbol === c.requiredSymbol,
  );
  p.explanation_refs = [p.source_target.reference.id];
  assert.equal(scoreSelection(summary, c, c.packet).selected, true);
  assert.equal(scoreSelection(summary, c, c.packet).passed, false);
});
test("focused transport fixture reproduces the exact sealed formatter packet and retains partial-context disclosures", async () => {
  const c = await focusedFixture(),
    s = (await loadSuite()).cases[1];
  assert.deepEqual(c.response.packet, s.packet);
  assert.equal(c.response.packet.contexts[0].same_file_reference, null);
  assert.equal(c.response.coverage.files[0].same_file_supplied, false);
  assert.equal(c.response.interpretation, "none");
  assert.equal(c.response.independently_tested, false);
  assert.ok(Buffer.byteLength(JSON.stringify(c.response)) <= 65536);
});
test("operator requires explicit account use and refuses overwrite; archive paths are fixed", async () => {
  await fs.access(path.join(directory, "results.json"));
  for (const args of [[], ["--run", "unused-model", "low"]]) {
    const r = spawnSync(
      process.execPath,
      [path.join(directory, "run.mjs"), ...args],
      { env: {}, encoding: "utf8", timeout: 5000 },
    );
    assert.notEqual(r.status, 0);
    assert.match(
      r.stderr,
      args.length ? /already has results/ : /Explicit account use/,
    );
  }
  await assert.rejects(
    loadEngine({ historical: "../../target" }),
    /Unknown trusted historical/,
  );
});
