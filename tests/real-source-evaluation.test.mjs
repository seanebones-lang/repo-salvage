import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";
import { buildHoldout } from "../examples/analysis-evaluation/holdout.mjs";
import { scoreSelection } from "../examples/analysis-evaluation/scoring.mjs";
import { inspectCodexTrace } from "../examples/analysis-evaluation/trace.mjs";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sha256 } from "../examples/analysis-evaluation/holdout.mjs";
test("sealed historical source rebuilds archived packets offline, with rubric outside requests", async () => {
  const engine = await loadEngine({ historical: true });
  try {
    const suite = await buildHoldout(engine);
    assert.equal(suite.cases.length, 8);
    assert.equal(new Set(suite.cases.map((c) => c.repo)).size, 2);
    for (const c of suite.cases)
      for (const point of c.reviewPoints)
        assert.equal(c.request.input.includes(point), false);
    assert.equal(
      suite.seal.coverage.filter((p) => p.indexed && !p.supplied).length,
      3,
    );
    assert.equal(suite.seal.coverage.filter((p) => !p.inspected).length, 3);
  } finally {
    await engine.close();
  }
});
const expectation = {
  outcome: "candidates",
  allowedTargets: ["a.py#one", "b.py#two"],
  requiredGroups: [["a.py#one"], ["b.py#two"]],
  minCandidates: 2,
  maxCandidates: 2,
};
const summary = (...targets) => ({
  reusable_pieces: targets.map(([path, symbol]) => ({
    source_target: { path, symbol },
  })),
});
test("missing required selections fail even with perfect precision", () => {
  const score = scoreSelection(
    { outcome: "candidates" },
    summary(["a.py", "one"]),
    expectation,
  );
  assert.equal(score.passed, false);
  assert.equal(score.precision, 1);
  assert.equal(score.requiredGroupRecall, 0.5);
});
test("same symbol in a different file, duplicates and wrong outcomes cannot pass", () => {
  assert.equal(
    scoreSelection(
      { outcome: "candidates" },
      summary(["wrong.py", "one"], ["b.py", "two"]),
      expectation,
    ).passed,
    false,
  );
  assert.equal(
    scoreSelection(
      { outcome: "candidates" },
      summary(["a.py", "one"], ["a.py", "one"]),
      expectation,
    ).passed,
    false,
  );
  assert.equal(
    scoreSelection(
      { outcome: "no_candidates" },
      summary(["a.py", "one"], ["b.py", "two"]),
      expectation,
    ).passed,
    false,
  );
  assert.equal(
    scoreSelection(
      { outcome: "candidates" },
      summary(["a.py", "one"], ["b.py", "two"]),
      expectation,
    ).passed,
    true,
  );
});
test("negative cases require the empty selection and explicit outcome", () => {
  const negative = {
    outcome: "no_candidates",
    allowedTargets: [],
    requiredGroups: [],
    minCandidates: 0,
    maxCandidates: 0,
  };
  const score = scoreSelection(
    { outcome: "no_candidates" },
    summary(),
    negative,
  );
  assert.equal(score.passed, true);
  assert.equal(score.precision, null);
  assert.equal(score.requiredGroupRecall, null);
  assert.equal(
    scoreSelection(
      { outcome: "candidates" },
      summary(["a.py", "one"]),
      negative,
    ).passed,
    false,
  );
});
const trace = (...events) => events.map((e) => JSON.stringify(e)).join("\n");
test("completed CLI traces reject tools, malformed records, missing completion and failures", () => {
  const completed = { type: "turn.completed", usage: { input_tokens: 1 } };
  const clean = trace(
    { type: "item.completed", item: { type: "agent_message" } },
    completed,
  );
  assert.equal(inspectCodexTrace(clean, 0).transportSuccess, true);
  assert.equal(
    inspectCodexTrace(clean + "\n{", 0).failure,
    "malformed_cli_trace",
  );
  assert.equal(
    inspectCodexTrace(clean + "\nnull", 0).failure,
    "malformed_cli_trace",
  );
  assert.equal(
    inspectCodexTrace(
      trace(completed, {
        type: "item.started",
        item: { type: "command_execution" },
      }),
      0,
    ).failure,
    "prohibited_tool_event",
  );
  assert.equal(inspectCodexTrace("", 0).transportSuccess, false);
  assert.equal(
    inspectCodexTrace(trace(completed, { type: "turn.failed" }), 0)
      .transportSuccess,
    false,
  );
  assert.equal(inspectCodexTrace(clean, 0, true).failure, "cli_timeout");
  assert.equal(inspectCodexTrace(clean, 1).transportSuccess, false);
});
test("archived answers replay structural/reference and selection gates against the exact sealed requests", async () => {
  const report = JSON.parse(
    await fs.readFile(
      new URL(
        "../examples/analysis-evaluation/holdout/results.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const engine = await loadEngine({ historical: true });
  try {
    const suite = await buildHoldout(engine);
    for (const run of report.runs) {
      assert.equal(run.suiteSealSha256, sha256(JSON.stringify(suite.seal)));
      assert.equal(run.cases.length, suite.cases.length);
      let accepted = 0;
      for (const result of run.cases) {
        const c = suite.cases.find((c) => c.id === result.id);
        assert.ok(c);
        assert.equal(result.requestSha256, c.requestSha256);
        const text = JSON.stringify(result.answer);
        assert.equal(sha256(text), result.answerSha256);
        const summary = engine.verifiedIndexedSummary(text, c.index, c.packet);
        assert.deepEqual(
          scoreSelection(result.answer, summary, c.expectation),
          result.selection,
        );
        assert.equal(result.selection.passed, true);
        accepted++;
      }
      assert.equal(accepted, run.summary.structuralPasses);
    }
  } finally {
    await engine.close();
  }
});

test("coverage epoch validates pinned blobs, complete contexts and stage-specific discovery", async () => {
  const engine = await loadEngine({ historical: true });
  try {
    const baseline = await buildHoldout(engine);
    const suite = await buildHoldout(engine, true, "coverage");
    assert.equal(suite.cases.length, 4);
    assert.equal(suite.seal.coverage.filter((p) => p.inspected).length, 6);
    assert.equal(suite.seal.coverage.filter((p) => p.supplied).length, 3);
    assert.equal(
      suite.seal.coverage.filter((p) => p.sameFileContext).length,
      4,
    );
    assert.equal(baseline.seal.coverage.filter((p) => p.supplied).length, 0);
    const packets = new Map(suite.cases.map((c) => [c.repo, c.packet]));
    for (const [repo, packet] of packets) {
      assert.equal(packet.selection_policy, "repo-salvage/coverage-v1");
      assert.ok(JSON.stringify(packet).length <= 70000);
      assert.ok(packet.targets.length <= 24);
      assert.equal(
        new Set(packet.targets.map((t) => t.path)).size,
        packet.targets.length,
      );
      const original = baseline.cases.find((c) => c.repo === repo).packet;
      assert.ok(
        new Set(packet.targets.map((t) => t.path)).size >
          new Set(original.targets.map((t) => t.path)).size,
      );
      for (const context of packet.contexts) {
        const target = packet.targets.find((t) => t.id === context.target_id);
        assert.ok(target);
        if (context.same_file_reference) {
          const reference = packet.references.find(
            (r) => r.id === context.same_file_reference,
          );
          assert.ok(reference);
          assert.equal(reference.path, target.path);
          assert.equal(reference.kind, "file");
        }
      }
    }
    for (const c of suite.cases) {
      for (const point of c.reviewPoints)
        assert.equal(c.request.input.includes(point), false);
      for (const selected of c.expectation.allowedTargets) {
        const target = c.packet.targets.find(
          (t) => `${t.path}#${t.symbol}` === selected,
        );
        const context = c.packet.contexts.find(
          (v) => v.target_id === target.id,
        );
        assert.ok(context.same_file_reference);
      }
    }
  } finally {
    await engine.close();
  }
});

test("coverage answers replay exact sealed requests and completed epoch refuses refreeze", async () => {
  const report = JSON.parse(
    await fs.readFile(
      new URL(
        "../examples/analysis-evaluation/coverage/results.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const engine = await loadEngine({ historical: true });
  try {
    const suite = await buildHoldout(engine, true, "coverage");
    for (const run of report.runs) {
      assert.equal(run.suiteSealSha256, sha256(JSON.stringify(suite.seal)));
      assert.equal(run.cases.length, suite.cases.length);
      for (const result of run.cases) {
        const c = suite.cases.find((c) => c.id === result.id);
        assert.ok(c);
        assert.equal(result.requestSha256, c.requestSha256);
        const text = JSON.stringify(result.answer);
        assert.equal(sha256(text), result.answerSha256);
        const verified = engine.verifiedIndexedSummary(text, c.index, c.packet);
        assert.deepEqual(
          scoreSelection(result.answer, verified, c.expectation),
          result.selection,
        );
        assert.equal(result.selection.passed, true);
      }
      assert.equal(
        run.cases.filter((c) => c.semanticReview.passed).length,
        run.summary.semanticReviewPasses,
      );
    }
    const sealUrl = new URL(
      "../examples/analysis-evaluation/coverage/seal.json",
      import.meta.url,
    );
    const before = await fs.readFile(sealUrl);
    const freeze = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../examples/analysis-evaluation/freeze-coverage.mjs",
            import.meta.url,
          ),
        ),
        "--freeze",
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.notEqual(freeze.status, 0);
    assert.match(freeze.stderr, /Completed evaluation epoch/);
    assert.deepEqual(await fs.readFile(sealUrl), before);
  } finally {
    await engine.close();
  }
});
