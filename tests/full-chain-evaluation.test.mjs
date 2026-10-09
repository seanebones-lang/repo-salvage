import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadSuite,
  loadGenerated,
  read,
  directory,
  sha256,
} from "../examples/full-chain-evaluation/suite.mjs";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";

test("full-chain source, production request and hidden acceptance tests retain their pre-run seal", async () => {
  const s = await loadSuite();
  assert.equal(s.corpus.files.length, 22);
  assert.equal(s.corpus.metadata.license, "MIT");
  assert.equal(s.corpus.metadata.private, false);
  assert.equal(JSON.parse(s.request.input).owner_context, null);
  assert.ok(!s.request.input.includes("expectedAnswer"));
  assert.ok(!s.request.input.includes("test_randomized_reference_model"));
  assert.equal(s.index.targets.length, 144);
});
test("the source-selection miss and generated-brief miss remain distinct recorded gates", async () => {
  const s = await loadSuite(),
    coverage = await read("coverage.json"),
    analysis = await read("analysis-results.json");
  const e = await loadEngine();
  try {
    assert.equal(
      e
        .evidencePacket(s.index, undefined, "repo-salvage/coverage-v1")
        .targets.some((t) => t.symbol === "LRUCache"),
      false,
    );
    assert.equal(
      s.packet.targets.some((t) => t.symbol === "LRUCache"),
      true,
    );
  } finally {
    await e.close();
  }
  assert.equal(coverage.beforeLru, false);
  assert.equal(coverage.afterLru, true);
  assert.equal(coverage.sameFileContext, false);
  assert.equal(analysis.structurallyAccepted, true);
  assert.equal(analysis.requiredSymbolSelected, false);
});
test("the isolated listing is exactly the verified generated summary, without owner nomination", async () => {
  const s = await loadGenerated(),
    rows = await read("listings.json");
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].summary_json), s.summary);
  assert.match(rows[0].owner_note, /no owner nomination/);
  assert.equal(rows[0].source_sha, s.corpus.commit);
  assert.equal(s.summary.reusable_pieces.length, 6);
  for (const p of s.summary.reusable_pieces) {
    assert.ok(p.source_target.reference.sha256);
    assert.equal(p.source_sampled, true);
  }
  const catalog = await read("catalog.json");
  assert.equal(catalog.pagination.total, 6);
});
test("the native operator entry point requires explicit account use", () => {
  const r = spawnSync(process.execPath, [path.join(directory, "adapt.mjs")], {
    encoding: "utf8",
    env: {},
    timeout: 5000,
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Explicit account use/);
});
