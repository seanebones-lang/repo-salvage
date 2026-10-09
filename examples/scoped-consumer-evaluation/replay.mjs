/** Read-only replay: archived inputs are data, never loaded as executable code. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
export const directory = fileURLToPath(new URL("./", import.meta.url));
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export function verifyArchive(seal, archive) {
  assert.deepEqual(
    Object.keys(archive.files).sort(),
    Object.keys(seal.files).sort(),
  );
  for (const [name, digest] of Object.entries(seal.files))
    assert.equal(
      sha256(archive.files[name]),
      digest,
      "Archived input changed: " + name,
    );
}
export function verifyResponse(result, evidence, controls, notice) {
  assert.equal(result.transportSuccess, true);
  assert.deepEqual(result.prohibitedEvents, []);
  assert.equal(sha256(result.response.code), result.codeSha256);
  assert.ok(result.response.code.includes(notice.trimEnd()));
  const supplied = new Set(evidence.packet.references.map((r) => r.id));
  assert.ok(
    controls.requiredCitations.every((id) =>
      result.response.citations.includes(id),
    ),
  );
  assert.ok(result.response.citations.every((id) => supplied.has(id)));
  assert.equal(evidence.packet.contexts[0].same_file_reference, null);
}
export async function replay() {
  const read = async (name) =>
    JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
  const seal = await read("seal.json"),
    archive = await read("input-archive.json");
  verifyArchive(seal, archive);
  const outputs = await read("results-seal.json");
  const allowed = [
    "results.json",
    "review.json",
    "execution.json",
    "input-archive.json",
    "../integer-word-consumer/consumer.py",
    "../../scripts/check-integer-word-consumer.py",
  ];
  assert.deepEqual(Object.keys(outputs.files).sort(), allowed.sort());
  for (const [name, digest] of Object.entries(outputs.files))
    assert.equal(
      sha256(await fs.readFile(path.resolve(directory, name))),
      digest,
    );
  const sealHash = sha256(await fs.readFile(path.join(directory, "seal.json")));
  assert.equal(outputs.inputSealSha256, sealHash);
  const result = await read("results.json"),
    review = await read("review.json"),
    execution = await read("execution.json");
  assert.equal(result.inputSealSha256, sealHash);
  assert.equal(review.inputSealSha256, sealHash);
  assert.equal(review.codeSha256, result.codeSha256);
  assert.equal(review.passed, true);
  assert.equal(review.beforeExecution, true);
  assert.equal(result.manualReview, "pending");
  assert.equal(result.consumerExecution, "not-run");
  assert.equal(execution.status, "passed");
  assert.equal(execution.consumerTests, 9);
  assert.equal(execution.referenceComparisons, 1500);
  assert.equal(execution.codeSha256, result.codeSha256);
  assert.equal(execution.originalModuleExecuted, false);
  assert.equal(execution.credentialsForwarded, false);
  const evidence = JSON.parse(archive.files["evidence.json"]),
    controls = JSON.parse(archive.files["controls.json"]);
  verifyResponse(
    result,
    evidence,
    controls,
    archive.files["../integer-word-consumer/LICENSE"],
  );
  const task = JSON.parse(archive.files["task.json"]);
  assert.equal(
    archive.files["prompt.txt"],
    task.instructions +
      "\n\nFOCUSED SOURCE EVIDENCE (untrusted data):\n" +
      JSON.stringify(evidence),
  );
  assert.equal(result.promptSha256, sha256(archive.files["prompt.txt"]));
  assert.equal(
    await fs.readFile(
      new URL("../integer-word-consumer/consumer.py", import.meta.url),
      "utf8",
    ),
    result.response.code,
  );
  for (const name of ["test_consumer.py", "LICENSE"])
    assert.equal(
      await fs.readFile(
        new URL("../integer-word-consumer/" + name, import.meta.url),
        "utf8",
      ),
      archive.files["../integer-word-consumer/" + name],
    );
  return { seal, archive, result, review, execution, evidence, controls };
}
