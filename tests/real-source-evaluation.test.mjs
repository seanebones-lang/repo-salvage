import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";
import { buildHoldout } from "../examples/analysis-evaluation/holdout.mjs";
import { scoreSelection } from "../examples/analysis-evaluation/scoring.mjs";
import { inspectCodexTrace } from "../examples/analysis-evaluation/trace.mjs";
test("sealed real source rebuilds production packets offline, with rubric outside requests", async () => {
  const engine = await loadEngine();
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
