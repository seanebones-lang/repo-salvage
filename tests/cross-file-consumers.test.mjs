import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  directory,
  read,
  verifyInputs,
  verifyProposal,
} from "../examples/cross-file-consumers/common.mjs";
import { evidence, sha } from "../examples/cross-file-consumers/evidence.mjs";
import { inspectCodexTrace } from "../examples/analysis-evaluation/trace.mjs";

test("cross-file pre-proposal and result seals preserve every frozen input and exact first output", async () => {
  await verifyInputs();
  for (const input of (await read("results-seal.json")).inputs)
    assert.equal(
      sha(await fs.readFile(new URL(input.path, directory))),
      input.sha256,
      input.path,
    );
});
for (const language of ["rust", "go"]) {
  test(`${language} retained first trace completed without tools and cites selected plus supporting source`, async () => {
    const { result, code, seal } = await verifyProposal(language),
      raw = await fs.readFile(
        new URL(language + "/trace.jsonl", directory),
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
      execution = await read("execution.json"),
      approval = review.consumers.find((c) => c.language === language);
    assert.equal(review.inputSealSha256, seal);
    assert.equal(approval.approved, true);
    assert.equal(approval.codeSha256, sha(code));
    assert.equal(execution.inputSealSha256, seal);
    assert.equal(
      execution.reviewSha256,
      sha(await fs.readFile(new URL("review.json", directory))),
    );
    assert.equal(
      execution.results.find((c) => c.language === language).codeSha256,
      sha(code),
    );
    assert.equal(
      execution.results.find((c) => c.language === language).status,
      "passed",
    );
    assert.ok(
      Date.parse(review.at) < Date.parse(execution.at),
      "review before execution",
    );
  });
  test(`${language} current focused pipeline reproduces the frozen cross-file packet offline`, async () => {
    const packet = await evidence(language);
    assert.deepEqual(packet, await read(language + "/evidence.json"));
    assert.equal(packet.focus.symbol_match, "matched");
    const supportPath =
      language === "rust" ? "src/u128_ext.rs" : "xxhash_other.go";
    const supporting = packet.packet.references.find(
      (r) => r.path === supportPath && r.kind === "file",
    );
    assert.ok(supporting);
    assert.equal(sha(supporting.content), supporting.sha256);
    assert.ok(
      JSON.stringify(packet.packet.file_contexts).includes(supporting.id),
    );
    assert.equal(packet.independently_tested, false);
  });
  test(`${language} adaptation retains the exact pinned MIT notice`, async () => {
    const packet = await read(language + "/evidence.json"),
      license = packet.packet.references.find(
        (r) => r.path === (language === "rust" ? "LICENSE-MIT" : "LICENSE.txt"),
      );
    assert.equal(
      await fs.readFile(new URL(language + "/LICENSE", directory), "utf8"),
      license.content,
    );
  });
}
test("independent integer oracle reproduces all 2094 frozen hash vectors and nine official facts without target execution", async () => {
  await fs.readFile(new URL("go/vectors.json", directory));
  const r = spawnSync(
    "python3",
    [
      "-I",
      new URL("../examples/cross-file-consumers/oracle.py", import.meta.url)
        .pathname,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2094 frozen vectors; 9 official/);
});
