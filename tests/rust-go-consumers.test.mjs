import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEngine } from "../examples/analysis-evaluation/engine.mjs";
const directory = new URL("../examples/rust-go-consumers/", import.meta.url),
  sha256 = (b) => createHash("sha256").update(b).digest("hex");
const read = async (path) =>
  JSON.parse(await fs.readFile(new URL(path, directory), "utf8"));
test("both pre-proposal seals and first native outputs retain exact bytes and no tool events", async () => {
  for (const name of [
    "input-seal.json",
    "go-input-seal.json",
    "results-seal.json",
  ]) {
    for (const input of (await read(name)).inputs)
      assert.equal(
        sha256(await fs.readFile(new URL(input.path, directory))),
        input.sha256,
        input.path,
      );
  }
  const review = await read("review.json"),
    execution = await read("execution.json");
  for (const [language, seal] of [
    ["rust", "input-seal.json"],
    ["go", "go-input-seal.json"],
  ]) {
    const r = await read(language + "/result.json"),
      code = await fs.readFile(
        new URL(
          language + "/consumer." + (language === "rust" ? "rs" : "go"),
          directory,
        ),
      );
    assert.equal(
      r.inputSealSha256,
      sha256(await fs.readFile(new URL(seal, directory))),
    );
    assert.equal(r.transportSuccess, true);
    assert.deepEqual(r.prohibitedEvents, []);
    assert.equal(sha256(code), sha256(r.response.code));
    assert.equal(
      review.consumers.find((c) => c.language === language).codeSha256,
      sha256(code),
    );
    assert.equal(
      execution.results.find((c) => c.language === language).status,
      "passed",
    );
  }
});
test("current focused pipeline reproduces both frozen pinned packets without upstream execution", async () => {
  const corpus = await read("corpus.json"),
    cases = await read("cases.json"),
    engine = await loadEngine(),
    prior = globalThis.fetch;
  try {
    for (const c of cases) {
      const r = corpus.repositories.find((r) => r.repo === c.repository);
      for (const f of r.files) {
        assert.equal(sha256(f.content), f.sha256);
        assert.equal(
          createHash("sha1")
            .update(`blob ${Buffer.byteLength(f.content)}\0`)
            .update(f.content)
            .digest("hex"),
          f.blobSha,
        );
      }
      globalThis.fetch = async (url) => {
        if (String(url).includes("/git/trees/"))
          return new Response(
            JSON.stringify({
              tree: r.files.map((f) => ({
                path: f.path,
                type: "blob",
                mode: "100644",
                sha: f.blobSha,
                size: Buffer.byteLength(f.content),
              })),
            }),
          );
        const f = r.files.find((f) => String(url).endsWith("/" + f.path));
        assert.ok(f);
        return new Response(f.content);
      };
      const response = engine.focusedResponse(
        {
          id: c.listing_id,
          github_repo_id: r.metadata.id,
          owner_id: r.metadata.owner_id ?? 99101,
          full_name: r.repo,
          source_sha: r.commit,
        },
        await engine.focusedEvidence(r.repo, r.commit, {
          path: c.path,
          symbol: c.symbol,
          maxCharacters: c.max_characters,
        }),
      );
      assert.deepEqual(response, await read(c.id + "/evidence.json"));
      assert.equal(response.focus.symbol_match, "matched");
      assert.equal(response.packet.targets.length, 1);
      assert.ok(JSON.stringify(response.packet).length <= c.max_characters);
      if (c.id === "rust") {
        assert.equal(response.packet.contexts[0].same_file_reference, null);
        assert.equal(
          response.packet.scoped_contexts[0].observation,
          "rust-cst-names-v1",
        );
      }
    }
  } finally {
    globalThis.fetch = prior;
    await engine.close();
  }
});
