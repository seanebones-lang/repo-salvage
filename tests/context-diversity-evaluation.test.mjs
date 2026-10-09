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
} from "../examples/context-diversity-evaluation/suite.mjs";
import { scoreSelection } from "../examples/context-diversity-evaluation/score.mjs";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";
const fake = (symbols) => ({
  reusable_pieces: symbols.map((symbol) => ({
    source_target: { symbol },
    explanation_refs: [],
  })),
});
test("archived responses and manual reviews replay every separate gate without model calls", async () => {
  const suite = await loadSuite(),
    seal = await read("results-seal.json"),
    results = await read("results.json"),
    review = await read("review.json");
  const input = sha256(await fs.readFile(path.join(directory, "seal.json")));
  assert.equal(seal.inputSealSha256, input);
  assert.equal(results.inputSealSha256, input);
  for (const [name, digest] of Object.entries(seal.files))
    assert.equal(sha256(await fs.readFile(path.join(directory, name))), digest);
  assert.equal(results.results.length, suite.cases.length);
  const e = await loadEngine({ historical: "context-diversity-v1" });
  try {
    for (const c of suite.cases) {
      const result = results.results.find((r) => r.id === c.id);
      assert.equal(result.transportSuccess, true);
      assert.deepEqual(result.prohibitedEvents, []);
      const summary = e.verifiedIndexedSummary(
        JSON.stringify(result.response),
        c.index,
        c.packet,
      );
      assert.deepEqual(summary, result.summary);
      assert.deepEqual(scoreSelection(summary, c, c.packet), result.selection);
      assert.equal(result.selection.passed, true);
      assert.equal(review.cases.find((r) => r.id === c.id).passed, true);
      assert.equal(result.requestSha256, c.requestSha256);
    }
  } finally {
    await e.close();
  }
});
test("the trusted archive loader rejects unknown source locations", async () => {
  await assert.rejects(
    loadEngine({ historical: "../../untrusted-target" }),
    /Unknown trusted historical engine/,
  );
});
test("pre-run controls, complete Git blobs and all three exact archived requests remain frozen", async () => {
  const s = await loadSuite();
  assert.equal(s.cases.length, 3);
  assert.equal(s.corpus.repositories.length, 2);
  for (const c of s.cases) {
    assert.ok(!c.request.input.includes("requiredSymbols"));
    assert.ok(!c.request.input.includes("minimumGroups"));
    assert.equal(JSON.parse(c.request.input).owner_context, null);
    assert.ok(JSON.stringify(c.packet).length <= 70000);
  }
});
test("cache context changes while primary target identities stay fixed; monolithic schedule context remains explicitly absent", async () => {
  const e = await loadEngine({ historical: "context-diversity-v1" }),
    s = await loadSuite();
  try {
    const index = s.cases[0].index,
      old = e.evidencePacket(index, undefined, "repo-salvage/coverage-v2"),
      current = s.cases[0].packet;
    assert.deepEqual(current.targets, old.targets);
    const id = current.targets.find((t) => t.symbol === "LRUCache").id;
    assert.equal(
      old.contexts.find((c) => c.target_id === id).same_file_reference,
      null,
    );
    const ref = current.references.find(
      (r) =>
        r.id ===
        current.contexts.find((c) => c.target_id === id).same_file_reference,
    );
    assert.equal(ref.kind, "file");
    assert.ok(ref.content.includes("class Cache("));
    assert.ok(ref.content.includes("class LRUCache("));
    const fresh = s.cases[2];
    assert.equal(
      fresh.packet.contexts.find(
        (c) =>
          c.target_id ===
          fresh.packet.targets.find((t) => t.symbol === "Scheduler").id,
      ).same_file_reference,
      null,
    );
  } finally {
    await e.close();
  }
});
test("context-only and diversity profiles use identical evidence and schema, changing only the interpretation instruction", async () => {
  const { cases } = await loadSuite();
  assert.equal(cases[0].request.input, cases[1].request.input);
  assert.deepEqual(cases[0].request.schema, cases[1].request.schema);
  assert.notEqual(cases[0].request.system, cases[1].request.system);
  assert.ok(cases[1].request.system.startsWith(cases[0].request.system));
});
test("high candidate count cannot substitute for the required target, distinct capabilities or wrapper control", async () => {
  const c = (await loadSuite()).cases[1];
  assert.equal(
    scoreSelection(fake(["LRUCache", "hashkey", "cached"]), c, c.packet).passed,
    true,
  );
  assert.equal(
    scoreSelection(fake(["FIFOCache", "hashkey", "cached"]), c, c.packet)
      .passed,
    false,
  );
  assert.equal(
    scoreSelection(
      fake(["LRUCache", "FIFOCache", "hashkey", "typedkey"]),
      c,
      c.packet,
    ).passed,
    false,
  );
  assert.equal(
    scoreSelection(
      fake(["LRUCache", "hashkey", "methodkey", "cached"]),
      c,
      c.packet,
    ).passed,
    false,
  );
});
test("operator entry point refuses missing explicit account authorization", () => {
  const r = spawnSync(process.execPath, [path.join(directory, "run.mjs")], {
    env: {},
    encoding: "utf8",
    timeout: 5000,
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Explicit account use/);
});
