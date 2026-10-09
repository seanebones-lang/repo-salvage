import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  directory,
  read,
  sha,
  verifyInputs,
  promptFor,
  score,
  verifiedResult,
} from "../examples/context-recovery/suite.mjs";
import { focusCase, serveCase } from "../examples/context-recovery/fixture.mjs";
const controls = await read("controls.json"),
  corpus = await read("corpus.json");
test("recovery input and exact first-result seals retain the pre-run contract", async () => {
  await verifyInputs();
  for (const item of (await read("results-seal.json")).inputs)
    assert.equal(
      sha(await fs.readFile(new URL(item.path, directory))),
      item.sha256,
      item.path,
    );
});
for (const c of controls) {
  test(`${c.id}: earlier stop handoff and current engine reproduce the exact initial packet`, async () => {
    const src = corpus.cases.find((x) => x.id === c.id),
      initial = await read(c.id + "/initial-evidence.json");
    assert.deepEqual(
      (
        await focusCase(c.id, {
          path: src.path,
          symbol: src.symbol,
          maxCharacters: src.max_characters,
        })
      ).response,
      initial,
    );
    assert.deepEqual(
      await read(c.id + "/prior-stop.json"),
      JSON.parse(
        await fs.readFile(
          new URL(
            "../examples/missing-context-consumers/" +
              src.priorCase +
              "/result.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ).response,
    );
    const prompt = await promptFor(c.id);
    assert.ok(!prompt.includes("expectedDecision"));
    assert.ok(!prompt.includes("independent_vectors"));
    assert.ok(!prompt.includes(src.files[c.requiredPath]));
    assert.equal((await read(c.id + "/prior-stop.json")).code, "");
  });
  test(`${c.id}: exact helper retrieval uses production pin verification and reproduces the frozen response`, async () => {
    const expected = await read(c.id + "/recovery-evidence.json"),
      actual = await focusCase(c.id, {
        path: c.requiredPath,
        maxCharacters: 24000,
      });
    assert.deepEqual(actual, expected);
    if (c.expectedDecision === "adapt") {
      assert.equal(actual.status, 200);
      const source = corpus.cases.find((x) => x.id === c.id);
      assert.equal(actual.response.source.commit, source.commit);
      assert.ok(
        actual.response.packet.references.some(
          (r) =>
            r.path === c.requiredPath &&
            r.content === source.files[c.requiredPath],
        ),
        "complete helper file must be supplied alongside declaration references",
      );
    } else {
      assert.equal(actual.status, 503);
      assert.equal(actual.response.error.code, "source_integrity_failed");
      assert.ok(
        !JSON.stringify(actual.response).includes("corrupt transport bytes"),
      );
    }
  });
  test(`${c.id}: completed installed-MCP first trace, citations, history, review and compiler stages agree`, async () => {
    const { result, trace, seal } = await verifiedResult(c),
      review = await read("review.json"),
      approval = review.cases.find((x) => x.id === c.id),
      execution = await read("execution.json"),
      run = execution.results.find((x) => x.id === c.id),
      requests = await read(c.id + "/requests.json");
    assert.equal(review.inputSealSha256, seal);
    assert.equal(approval.responseSha256, sha(JSON.stringify(result.response)));
    assert.equal(execution.inputSealSha256, seal);
    assert.equal(
      execution.reviewSha256,
      sha(await fs.readFile(new URL("review.json", directory))),
    );
    assert.ok(Date.parse(review.at) < Date.parse(execution.at));
    assert.equal(result.review, "pending");
    assert.equal(result.execution, "not_run");
    assert.equal(requests.length, trace.calls.length);
    for (let i = 0; i < trace.calls.length; i++) {
      const call = trace.calls[i],
        request = requests[i],
        query = new URLSearchParams(request.query);
      assert.equal(query.get("path"), call.arguments.path);
      assert.equal(request.method, "GET");
      assert.equal(
        query.get("max_characters"),
        String(call.arguments.max_characters),
      );
      if (request.status === 200)
        assert.deepEqual(
          call.result.structured_content ?? call.result.structuredContent,
          request.response,
        );
      else
        assert.match(
          JSON.stringify(call.result ?? call.error),
          /source_integrity_failed/,
        );
    }
    assert.equal(approval.accepted, true);
    if (c.expectedDecision === "needs_context") {
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
      assert.equal(run.executed, true);
    }
  });
}
test("corrupted Go control retains exactly the same caller, helper and synthetic source identity", () => {
  const good = corpus.cases.find((x) => x.id === "go-unread-recovery"),
    bad = corpus.cases.find((x) => x.id === "go-integrity-stop");
  assert.deepEqual(good.files, bad.files);
  assert.equal(good.repo, bad.repo);
  assert.equal(good.commit, bad.commit);
  assert.equal(good.corruptHelper, false);
  assert.equal(bad.corruptHelper, true);
});
test("recovery scorer rejects lost gaps, changed pins, uncited helpers, false condition closure and unverified continuation", async () => {
  for (const c of controls) {
    const { result, trace } = await verifiedResult(c),
      initial = await read(c.id + "/initial-evidence.json"),
      recovery = await read(c.id + "/recovery-evidence.json"),
      check = (a, t = trace) => score(a, t, c, initial, recovery).passed;
    assert.equal(check(result.response), true);
    for (const mutate of [
      (a) => (a.gap_history = []),
      (a) => (a.gap_history[0].reason = "invented"),
      (a) => (a.source.commit = "0".repeat(40)),
      (a) => (a.used_reference_ids = []),
      (a) => a.used_reference_ids.push("invented"),
      (a) => (a.remaining_limitations = []),
    ]) {
      const a = structuredClone(result.response);
      mutate(a);
      assert.equal(check(a), false);
    }
    const noReads = structuredClone(trace);
    noReads.calls = [];
    assert.equal(check(result.response, noReads), false);
    if (c.expectedDecision === "needs_context") {
      const a = structuredClone(result.response);
      a.code = "return 0";
      a.decision = "adapt";
      assert.equal(check(a), false);
    } else {
      const a = structuredClone(result.response);
      a.decision = "needs_context";
      a.code = "";
      assert.equal(check(a), false);
      const otherCommit = structuredClone(trace);
      for (const call of otherCommit.calls) {
        const v =
          call.result?.structured_content ?? call.result?.structuredContent;
        if (v?.source) v.source.commit = "0".repeat(40);
      }
      assert.equal(check(result.response, otherCommit), false);
    }
  }
});
test("disposable fixture permits bounded GET scopes and rejects credentials, writes and unrelated paths", async () => {
  const server = await serveCase("go-unread-recovery");
  try {
    const initial = await read("go-unread-recovery/initial-evidence.json"),
      url =
        server.origin +
        `/api/v2/parts/${initial.listing_id}/evidence?path=z_helper.go&max_characters=24000`;
    for (const options of [
      { method: "POST" },
      { headers: { Authorization: "not-a-real-token" } },
    ])
      assert.equal((await fetch(url, options)).status, 404);
    assert.equal(
      (await fetch(url.replace("z_helper.go", "unrelated.go"))).status,
      404,
    );
    assert.equal((await fetch(url.replace("24000", "999999"))).status, 400);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});
