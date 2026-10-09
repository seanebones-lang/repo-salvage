import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  replay,
  verifyArchive,
  verifyResponse,
  directory,
} from "../examples/scoped-consumer-evaluation/replay.mjs";
test("scoped adaptation preserves pre-generation inputs, exact native code, source review and isolated execution separately", async () => {
  const s = await replay();
  assert.equal(s.result.citationsPass, true);
  assert.equal(s.result.noticePass, true);
  assert.equal(s.evidence.interpretation, "none");
  assert.equal(s.evidence.independently_tested, false);
  assert.equal(s.result.usage.input_tokens, 14454);
  assert.equal(s.execution.applicationImports, false);
  // Evidence before adaptation does not inherit this different consumer's test result.
  assert.ok(s.controls.scope.includes("no discovery or live retrieval claim"));
});
test("read-only archived inputs reject changes without executing archived programs", async () => {
  const s = await replay(),
    a = structuredClone(s.archive);
  a.files["../../packages/cli/lib/client.mjs"] += "\n";
  assert.throws(() => verifyArchive(s.seal, a), /Archived input changed/);
});
test("changed native code or absent supporting citations cannot pass replay", async () => {
  const s = await replay(),
    r = structuredClone(s.result);
  r.response.code += "\n";
  assert.throws(() =>
    verifyResponse(
      r,
      s.evidence,
      s.controls,
      s.archive.files["../integer-word-consumer/LICENSE"],
    ),
  );
  r.response.code = s.result.response.code;
  r.response.citations = [s.evidence.packet.targets[0].reference_id];
  assert.throws(() =>
    verifyResponse(
      r,
      s.evidence,
      s.controls,
      s.archive.files["../integer-word-consumer/LICENSE"],
    ),
  );
});
test("completed consumer epoch refuses implicit account use and result overwrite", () => {
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
});
