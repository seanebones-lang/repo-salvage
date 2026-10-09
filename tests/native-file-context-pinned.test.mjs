import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";
const bytes = await fs.readFile(
  new URL("../examples/native-file-context/pinned.json", import.meta.url),
);
const capture = JSON.parse(bytes),
  seal = JSON.parse(
    await fs.readFile(
      new URL(
        "../examples/native-file-context/pinned-seal.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const sha = (body) => createHash("sha256").update(body).digest("hex");
test("pinned native file-context bytes retain their source seal without provider calls or target execution", () => {
  assert.equal(sha(bytes), seal.sha256);
  assert.equal(seal.providerCalls, 0);
  assert.equal(seal.targetCodeExecuted, false);
  for (const c of capture.cases)
    for (const r of c.requests) {
      assert.equal(sha(r.body), r.sha256);
      assert.ok(r.url.includes(c.commit));
    }
  assert.equal(capture.cases.length, 3);
});
for (const c of capture.cases)
  test(`current focused source reproduces pinned ${c.id} file relationships and omissions`, async () => {
    const engine = await loadEngine(),
      prior = globalThis.fetch,
      requests = [];
    try {
      globalThis.fetch = async (url) => {
        const r = c.requests.find((r) => r.url === String(url));
        assert.ok(r, "New unretained source request");
        requests.push(String(url));
        return new Response(r.body);
      };
      const response = engine.focusedResponse(
        {
          id: c.listing_id,
          github_repo_id: c.github_repo_id,
          owner_id: c.owner_id,
          full_name: c.repo,
          source_sha: c.commit,
        },
        await engine.focusedEvidence(c.repo, c.commit, {
          path: c.path,
          symbol: c.symbol,
          maxCharacters: c.max_characters,
        }),
      );
      assert.deepEqual(response, c.response);
      assert.equal(requests.length, 6);
      if (c.id === "witness")
        assert.ok(
          response.packet.file_contexts[0].files.every((f) =>
            ["packet-budget", "not-inspected"].includes(f.reason),
          ),
        );
      else
        assert.ok(
          response.packet.file_contexts[0].files.some(
            (f) => f.reason === "supplied",
          ),
        );
      for (const r of response.packet.references.filter(
        (r) => r.kind === "file",
      ))
        assert.equal(sha(r.content), r.sha256);
    } finally {
      globalThis.fetch = prior;
      await engine.close();
    }
  });
