import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  directory,
  read,
  sha,
  verifyInputs,
  verifiedResult,
  promptFor,
  score,
} from "../examples/missing-context-consumers/suite.mjs";
import { evidence } from "../examples/missing-context-consumers/evidence.mjs";
import { inspectCodexTrace } from "../examples/analysis-evaluation/trace.mjs";
const controls = await read("controls.json"),
  corpus = await read("corpus.json");
test("missing-context inputs and exact first-result seal retain all pre-proposal bytes", async () => {
  await verifyInputs();
  for (const item of (await read("results-seal.json")).inputs)
    assert.equal(
      sha(await fs.readFile(new URL(item.path, directory))),
      item.sha256,
      item.path,
    );
});
for (const c of controls) {
  test(`${c.id}: current engine reproduces the authored packet and exact bounded reads without network or fixture execution`, async () => {
    const r = await evidence(c.id);
    assert.deepEqual(r.response, await read(c.id + "/evidence.json"));
    assert.deepEqual(r.requests, await read(c.id + "/reads.json"));
    assert.ok(r.requests.length <= 6);
    const source = corpus.cases.find((f) => f.id === c.id),
      candidate = r.response.packet.file_contexts
        .flatMap((x) => x.files)
        .find((f) => f.path === c.requiredPath);
    assert.equal(candidate.reason, c.requiredReason);
    const prompt = await promptFor(c.id);
    assert.ok(!prompt.includes("expectedDecision"));
    assert.ok(!prompt.includes("vectorCount"));
    assert.ok(!prompt.includes("independent_vectors"));
    if (c.expectedDecision === "needs_context") {
      assert.equal(candidate.reference_id, null);
      assert.ok(
        !r.response.packet.references.some((f) => f.path === c.requiredPath),
      );
      assert.ok(!prompt.includes(source.files[c.requiredPath]));
      if (
        c.requiredReason === "not-inspected" ||
        c.requiredReason === "restricted-module"
      )
        assert.ok(
          !r.requests.some((url) => url.endsWith("/" + c.requiredPath)),
        );
      else
        assert.ok(r.requests.some((url) => url.endsWith("/" + c.requiredPath)));
    } else
      assert.equal(
        r.response.packet.references.find(
          (f) => f.id === candidate.reference_id,
        ).content,
        source.files[c.requiredPath],
      );
  });
  test(`${c.id}: retained first decision, citations, review and completed tool-free trace agree`, async () => {
    const { result, seal } = await verifiedResult(c),
      raw = await fs.readFile(
        new URL(c.id + "/trace.jsonl", directory),
        "utf8",
      );
    assert.equal(sha(raw), result.trace.sha256);
    assert.deepEqual(inspectCodexTrace(raw, 0), {
      transportSuccess: result.transportSuccess,
      failure: result.failure,
      prohibitedEvents: result.prohibitedEvents,
      usage: result.usage,
    });
    const review = await read("review.json"),
      approval = review.cases.find((a) => a.id === c.id),
      execution = await read("execution.json"),
      run = execution.results.find((r) => r.id === c.id);
    assert.equal(review.inputSealSha256, seal);
    assert.equal(approval.accepted, true);
    assert.equal(approval.responseSha256, sha(JSON.stringify(result.response)));
    assert.equal(execution.inputSealSha256, seal);
    assert.equal(
      execution.reviewSha256,
      sha(await fs.readFile(new URL("review.json", directory))),
    );
    assert.ok(Date.parse(review.at) < Date.parse(execution.at));
    if (c.expectedDecision === "needs_context") {
      assert.equal(run.status, "needs_context");
      assert.equal(approval.approvedForExecution, false);
      assert.equal(run.compiled, false);
      assert.equal(run.executed, false);
      assert.equal(result.response.code, "");
    } else {
      const code = await fs.readFile(
        new URL(
          c.id + "/consumer." + (c.language === "rust" ? "rs" : "go"),
          directory,
        ),
      );
      assert.equal(sha(code), sha(result.response.code));
      assert.equal(sha(code), approval.codeSha256);
      assert.equal(run.codeSha256, sha(code));
      assert.equal(approval.approvedForExecution, true);
      assert.equal(run.status, "passed");
      assert.equal(run.compiled, true);
      assert.equal(run.executed, true);
    }
  });
}
test("matched tasks and helper contents are identical within each pair; only evidence availability or module restriction changes", async () => {
  for (const pair of ["rust-budget", "go-unread", "rust-conditional"]) {
    const a = corpus.cases.find((c) => c.id === pair + "-gap"),
      b = corpus.cases.find((c) => c.id === pair + "-control"),
      path = controls.find((c) => c.id === a.id).requiredPath;
    assert.equal(a.files[path], b.files[path]);
    assert.equal(
      await fs.readFile(new URL(a.id + "/task.txt", directory), "utf8"),
      await fs.readFile(new URL(b.id + "/task.txt", directory), "utf8"),
    );
  }
});
test("decision scoring rejects unsafe continuation, guessed gaps, absent citations and blanket refusal", async () => {
  for (const c of controls) {
    const r = await read(c.id + "/result.json"),
      e = await read(c.id + "/evidence.json");
    assert.equal(score(r.response, c, e).passed, true);
    const clone = () => structuredClone(r.response);
    const uncited = clone();
    uncited.used_reference_ids = [];
    assert.equal(score(uncited, c, e).passed, false);
    const hallucinated = clone();
    hallucinated.used_reference_ids.push("invented-reference");
    assert.equal(score(hallucinated, c, e).passed, false);
    if (c.expectedDecision === "needs_context") {
      const stub = clone();
      stub.code = "return 0";
      assert.equal(score(stub, c, e).passed, false);
      const guessed = clone();
      guessed.needed_context = [
        { path: "invented/file.rs", reason: c.requiredReason },
      ];
      assert.equal(score(guessed, c, e).passed, false);
      const wrongReason = clone();
      wrongReason.needed_context[0].reason =
        c.requiredReason === "packet-budget"
          ? "not-inspected"
          : "packet-budget";
      assert.equal(score(wrongReason, c, e).passed, false);
    } else {
      const refused = clone();
      refused.decision = "needs_context";
      refused.code = "";
      assert.equal(score(refused, c, e).passed, false);
    }
  }
});
