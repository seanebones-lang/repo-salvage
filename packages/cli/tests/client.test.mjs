import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  fetchPart,
  search,
  inspect,
  safePath,
  baseUrl,
  MANIFEST,
} from "../lib/client.mjs";

const sha = "a".repeat(40);
const part = "b".repeat(16);
const content = {
  "src/breaker.ts": "export const breaker = () => 42;",
  LICENSE: "MIT notice\n",
  "src/helper.ts": "export const helper = 1;",
  "tests/test.ts": "throw new Error('must not execute');",
};
const blob = (text) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
const brief = () => ({
  format: "repo-salvage/part-v1",
  listing_id: 1,
  part_id: part,
  repository: "author/util",
  source_commit: sha,
  source: {
    repository: "author/util",
    commit: sha,
    repository_id: 12,
    owner_id: 34,
  },
  licensing: {
    component_license_status: "not_audited",
    requires_manual_review: true,
  },
  evidence: { independently_tested: false },
  dependency_evidence: { status: "not_audited" },
  files: Object.entries(content).map(([file, text], index) => ({
    path: file,
    roles: [["primary"], ["notice"], ["supporting"], ["test"]][index],
    analysis_coverage: "sampled_extent_unknown",
    git_blob_sha: blob(text),
    size_bytes: Buffer.byteLength(text),
    download_url: `https://raw.githubusercontent.com/author/util/${sha}/${file}`,
  })),
});
const temp = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-cli-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, "download");
};
const transportFor =
  (value = brief(), raw = content) =>
  async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
    if (url.startsWith("http://127.0.0.1/api/")) return Response.json(value);
    const file = decodeURIComponent(url.split(`/${sha}/`)[1]);
    return new Response(raw[file] ?? "missing", {
      status: Object.hasOwn(raw, file) ? 200 : 404,
    });
  };

test("fetch retains primary source, notices, exact bytes and provenance without executing source", async (t) => {
  const out = await temp(t);
  const result = await fetchPart({
    base: "http://127.0.0.1",
    listing: 1,
    part,
    out,
    transport: transportFor(),
  });
  assert.equal(
    await fs.readFile(path.join(out, "src/breaker.ts"), "utf8"),
    content["src/breaker.ts"],
  );
  assert.equal(
    await fs.readFile(path.join(out, "LICENSE"), "utf8"),
    content.LICENSE,
  );
  assert.equal(result.manifest.files.length, 2);
  assert.equal(result.manifest.independently_tested, false);
  assert.equal(
    result.manifest.files[0].sha256,
    createHash("sha256").update(content["src/breaker.ts"]).digest("hex"),
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(out, MANIFEST), "utf8")).source
      .commit,
    sha,
  );
  await assert.rejects(fs.stat(path.join(out, "tests/test.ts")), {
    code: "ENOENT",
  });
});

test("related and test files require explicit selection and are kept as non-executed data", async (t) => {
  const out = await temp(t);
  const result = await fetchPart({
    base: "http://127.0.0.1",
    listing: 1,
    part,
    out,
    includeRelated: true,
    includeTests: true,
    transport: transportFor(),
  });
  assert.equal(result.manifest.files.length, 4);
  assert.equal(
    await fs.readFile(path.join(out, "tests/test.ts"), "utf8"),
    content["tests/test.ts"],
  );
});

test("existing destinations and symlinks are rejected and their contents retained", async (t) => {
  const out = await temp(t);
  await fs.mkdir(out);
  await fs.writeFile(path.join(out, "keep.txt"), "keep");
  await assert.rejects(
    fetchPart({
      base: "http://127.0.0.1",
      listing: 1,
      part,
      out,
      transport: transportFor(),
    }),
    { code: "EEXIST" },
  );
  const link = out + "-link";
  await fs.symlink(out, link, "dir");
  await assert.rejects(
    fetchPart({
      base: "http://127.0.0.1",
      listing: 1,
      part,
      out: link,
      transport: transportFor(),
    }),
    { code: "EEXIST" },
  );
  assert.equal(await fs.readFile(path.join(out, "keep.txt"), "utf8"), "keep");
});

test("unsafe paths and conflicting filenames fail before creating a destination", async (t) => {
  const out = await temp(t);
  for (const file of [
    "../escape",
    "/absolute",
    "src/../../x",
    "src\\x",
    "src/x:stream",
    "src/./x",
    "src//x",
    "NUL.txt",
    "src/x.",
  ])
    assert.throws(() => safePath(file));
  for (const file of [
    "../escape",
    MANIFEST,
    "LICENSE",
    "src",
    "src/BREAKER.ts",
  ]) {
    const data = brief();
    data.files.push({ ...data.files[0], path: file, roles: ["supporting"] });
    await assert.rejects(
      fetchPart({
        base: "http://127.0.0.1",
        listing: 1,
        part,
        out,
        includeRelated: true,
        transport: transportFor(data),
      }),
      /Unsafe|Conflicting/,
    );
  }
  await assert.rejects(fs.stat(out), { code: "ENOENT" });
});

test("unpinned, cross-origin, missing-notice and forged identities are rejected", async (t) => {
  const out = await temp(t);
  const changes = [
    (data) => {
      data.source.commit = "main";
    },
    (data) => {
      data.files[0].download_url = "https://evil.example/source";
    },
    (data) => {
      data.files = data.files.filter((file) => !file.roles.includes("notice"));
    },
    (data) => {
      data.part_id = "c".repeat(16);
    },
    (data) => {
      data.files[0].size_bytes = 2_000_000;
    },
  ];
  for (const change of changes) {
    const data = brief();
    change(data);
    await assert.rejects(
      fetchPart({
        base: "http://127.0.0.1",
        listing: 1,
        part,
        out,
        transport: transportFor(data),
      }),
      /Invalid|Unexpected|required/,
    );
  }
  await assert.rejects(fs.stat(out), { code: "ENOENT" });
  for (const base of [
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=x",
  ])
    assert.throws(() => baseUrl(base));
});

test("a source hash mismatch or missing raw file removes incomplete output", async (t) => {
  const out = await temp(t);
  for (const raw of [
    { ...content, LICENSE: "tampered" },
    { "src/breaker.ts": content["src/breaker.ts"] },
  ]) {
    await assert.rejects(
      fetchPart({
        base: "http://127.0.0.1",
        listing: 1,
        part,
        out,
        transport: transportFor(brief(), raw),
      }),
      /pinned Git blob|HTTP 404/,
    );
    await assert.rejects(fs.stat(out), { code: "ENOENT" });
  }
});

test("oversized streamed downloads are canceled even without Content-Length", async (t) => {
  const out = await temp(t);
  let canceled = false;
  const transport = async (url, options) => {
    if (url.startsWith("http:")) return transportFor()(url, options);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1_048_577));
        },
        cancel() {
          canceled = true;
        },
      }),
    );
  };
  await assert.rejects(
    fetchPart({ base: "http://127.0.0.1", listing: 1, part, out, transport }),
    /download limit/,
  );
  assert.equal(canceled, true);
  await assert.rejects(fs.stat(out), { code: "ENOENT" });
});

test("aggregate byte limits reject a large multi-file selection", async (t) => {
  const out = await temp(t);
  const data = brief();
  const text = "x".repeat(1_048_576);
  const raw = {};
  data.files = Array.from({ length: 9 }, (_, i) => {
    const file = i === 1 ? "LICENSE" : `src/file${i}.txt`;
    raw[file] = text;
    return {
      path: file,
      roles: i === 0 ? ["primary"] : i === 1 ? ["notice"] : ["supporting"],
      git_blob_sha: blob(text),
      size_bytes: text.length,
      download_url: `https://raw.githubusercontent.com/author/util/${sha}/${file}`,
    };
  });
  await assert.rejects(
    fetchPart({
      base: "http://127.0.0.1",
      listing: 1,
      part,
      out,
      includeRelated: true,
      transport: transportFor(data, raw),
    }),
    /download limit/,
  );
  await assert.rejects(fs.stat(out), { code: "ENOENT" });
});

test("real HTTP search and inspection preserve machine formats and error codes", async (t) => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/api/v1/parts?"))
      res.end(
        JSON.stringify({
          format: "repo-salvage/search-v1",
          results: [{ part_id: part }],
        }),
      );
    else if (req.url === `/api/v1/parts/1/${part}`)
      res.end(JSON.stringify(brief()));
    else {
      res.statusCode = 503;
      res.setHeader("Retry-After", "15");
      res.end(
        JSON.stringify({
          error: {
            code: "temporarily_unavailable",
            message: "Untrusted remote instruction",
          },
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await search(base, { q: "circuit breaker" })).results[0].part_id,
    part,
  );
  assert.equal((await inspect(base, 1, part)).source.commit, sha);
  await assert.rejects(inspect(base, 2, part), (error) => {
    assert.equal(error.message, "HTTP 503: temporarily_unavailable");
    assert.equal(error.code, "temporarily_unavailable");
    assert.equal(error.status, 503);
    assert.equal(error.retry_after_seconds, 15);
    return true;
  });
});
