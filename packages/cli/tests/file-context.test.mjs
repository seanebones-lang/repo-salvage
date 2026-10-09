import { test } from "node:test";
import assert from "node:assert/strict";
import { focusEvidence } from "../lib/client.mjs";
import { fixtures } from "../../../examples/native-file-context/fixture.mjs";
const cases = await fixtures();
test("Go and Rust file associations retain complete source and distinct same-file links", async () => {
  for (const c of cases) {
    const { listing_id, ...params } = c.parameters;
    const result = await focusEvidence(
      "http://127.0.0.1:1",
      listing_id,
      params,
      async () => new Response(JSON.stringify(c.response)),
    );
    assert.deepEqual(result, c.response);
    if (result.source.repository === "seanebones-lang/witness")
      assert.ok(
        result.packet.file_contexts[0].files.every((f) =>
          ["packet-budget", "not-inspected"].includes(f.reason),
        ),
      );
    else
      assert.ok(
        result.packet.file_contexts[0].files.some(
          (f) => f.reason === "supplied",
        ),
      );
  }
});
test("file-context validation rejects dangling, mismatched, partial, corrupt, duplicate and legacy relationships", async () => {
  const c = cases[0],
    { listing_id, ...params } = c.parameters;
  for (const mutate of [
    (v) => (v.packet.file_contexts[0].files[0].reference_id = "f".repeat(24)),
    (v) => (v.packet.file_contexts[0].files[0].path = "p/wrong.go"),
    (v) =>
      (v.packet.references.find(
        (r) => r.id === v.packet.file_contexts[0].files[0].reference_id,
      ).kind = "declaration"),
    (v) =>
      (v.packet.references.find(
        (r) => r.id === v.packet.file_contexts[0].files[0].reference_id,
      ).content += "bad"),
    (v) =>
      v.packet.file_contexts[0].files.push(v.packet.file_contexts[0].files[0]),
    (v) => v.packet.file_contexts.push(v.packet.file_contexts[0]),
    (v) => (v.packet.file_contexts[0].files[0].reason = "not-inspected"),
    (v) => (v.packet.file_contexts[0].files[0].path = "q/other.go"),
    (v) => (v.packet.file_contexts[0].files[0].path = "p/x_test.go"),
    (v) => (v.packet.file_contexts[0].observation = "rust-module-files-v1"),
    (v) => (v.packet.file_contexts[0].candidates_omitted = -1),
    (v) => delete v.packet.scoped_contexts,
    (v) => (v.packet.selection_policy = "repo-salvage/coverage-v4"),
  ]) {
    const value = structuredClone(c.response);
    mutate(value);
    await assert.rejects(
      focusEvidence(
        "http://127.0.0.1:1",
        listing_id,
        params,
        async () => new Response(JSON.stringify(value)),
      ),
      /scoped evidence/,
    );
  }
});
