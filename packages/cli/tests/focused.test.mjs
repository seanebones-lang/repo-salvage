import { test } from "node:test";
import assert from "node:assert/strict";
import { focusEvidence } from "../lib/client.mjs";
import {
  focusCases,
  serveFocusFixture,
} from "../../../examples/focused-evidence/fixture-server.mjs";
const suite = await focusCases();
test("focus client retrieves all six pinned regressions with no credential or write", async () => {
  const fixture = await serveFocusFixture();
  try {
    for (const c of suite.cases) {
      const { listing_id, ...params } = c.parameters;
      assert.deepEqual(
        await focusEvidence(fixture.origin, listing_id, params),
        c.response,
      );
    }
    assert.equal(fixture.requests.length, 6);
    assert.ok(
      fixture.requests.every(
        (r) => r.method === "GET" && r.authorization === undefined,
      ),
    );
  } finally {
    await fixture.close();
  }
});
test("focus client rejects unsafe paths, symbols, identity and unknown fields before transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    throw Error("unexpected request");
  };
  for (const params of [
    { path: "../x" },
    { path: "lib/", symbol: "name" },
    { path: "x.ts", max_characters: 0 },
    { path: "x.ts", token: "secret" },
    { path: "x.ts", symbol: "\0" },
  ])
    await assert.rejects(
      focusEvidence("http://127.0.0.1:1", 901, params, transport),
    );
  await assert.rejects(
    focusEvidence("http://127.0.0.1:1", 0, { path: "x.ts" }, transport),
  );
  assert.equal(calls, 0);
});
test("focus client rejects mismatched identity, scope and oversized responses", async () => {
  const c = suite.cases[0];
  const { listing_id, ...params } = c.parameters;
  for (const value of [
    { ...c.response, listing_id: 999 },
    { ...c.response, focus: { ...c.response.focus, path: "other.ts" } },
    { ...c.response, interpretation: "generated" },
  ])
    await assert.rejects(
      focusEvidence(
        "http://127.0.0.1:1",
        listing_id,
        params,
        async () => new Response(JSON.stringify(value)),
      ),
    );
  await assert.rejects(
    focusEvidence(
      "http://127.0.0.1:1",
      listing_id,
      params,
      async () => new Response("x".repeat(65537)),
    ),
    /limit/,
  );
});
test("focus client retains actionable errors and makes no automatic retry", async () => {
  let calls = 0;
  await assert.rejects(
    focusEvidence("http://127.0.0.1:1", 901, { path: "lib/" }, async () => {
      calls++;
      return new Response(
        JSON.stringify({
          error: { code: "focus_too_broad", message: "untrusted" },
        }),
        { status: 409 },
      );
    }),
    (error) =>
      error.code === "focus_too_broad" &&
      error.status === 409 &&
      !error.message.includes("untrusted"),
  );
  assert.equal(calls, 1);
});

test("coverage-v4 scoped evidence replays exact pinned constants and omissions through the CLI", async () => {
  const { focusedFixture } =
    await import("../../../examples/scoped-context-evaluation/focus-fixture.mjs");
  const c = await focusedFixture();
  const { listing_id, ...params } = c.parameters;
  const actual = await focusEvidence(
    "http://127.0.0.1:1",
    listing_id,
    params,
    async () => new Response(JSON.stringify(c.response)),
  );
  assert.deepEqual(actual, c.response);
  assert.equal(actual.packet.contexts[0].same_file_reference, null);
  assert.ok(
    actual.packet.references.some(
      (r) => r.kind === "statement" && r.content.startsWith("powers ="),
    ),
  );
  assert.equal(
    actual.packet.scoped_contexts[0].gaps[0].symbol,
    "NumberOrString",
  );
});
test("coverage-v4 rejects dangling, duplicate, cross-file and unsupported scoped observations", async () => {
  const { focusedFixture } =
    await import("../../../examples/scoped-context-evaluation/focus-fixture.mjs");
  const c = await focusedFixture();
  const { listing_id, ...params } = c.parameters;
  const edits = [
    (v) => {
      v.packet.scoped_contexts[0].references[0].reference_id = "f".repeat(24);
    },
    (v) => {
      v.packet.scoped_contexts[0].target_id = "f".repeat(16);
    },
    (v) => {
      v.packet.scoped_contexts.push(v.packet.scoped_contexts[0]);
    },
    (v) => {
      v.packet.references[0].path = "other.py";
    },
    (v) => {
      v.packet.scoped_contexts[0].observation = "complete-closure";
    },
    (v) => {
      v.packet.scoped_contexts[0].gaps[0].reason = "verified";
    },
    (v) => {
      v.packet.scoped_contexts[0].observations_omitted = -1;
    },
    (v) => {
      v.packet.references.push(v.packet.references[0]);
    },
    (v) => {
      v.packet.contexts[0].same_file_reference = "f".repeat(24);
    },
    (v) => {
      v.packet.contexts[0].same_file_reference =
        v.packet.targets[0].reference_id;
    },
    (v) => {
      v.packet.contexts = [];
    },
    (v) => {
      v.packet.references.find(
        (r) => r.id === v.packet.scoped_contexts[0].references[0].reference_id,
      ).sha256 = "f".repeat(64);
    },
    (v) => {
      v.packet.references.find((r) => r.kind === "file").content += "tampered";
    },
  ];
  for (const edit of edits) {
    const value = structuredClone(c.response);
    edit(value);
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

test("coverage-v5 Rust scoped units and Go receiver declarations replay through CLI validation", async () => {
  const { serveFixture } =
    await import("../../../examples/rust-go-consumers/fixture.mjs");
  const f = await serveFixture();
  try {
    for (const c of f.cases) {
      const { listing_id, ...params } = c.parameters;
      assert.deepEqual(
        await focusEvidence(f.origin, listing_id, params),
        c.response,
      );
    }
  } finally {
    await f.close();
  }
  assert.ok(
    f.requests.every(
      (r) => r.method === "GET" && r.authorization === undefined,
    ),
  );
});
test("coverage-v5 rejects native observations on old policy, wrong language and impossible relations", async () => {
  const { fixtures } =
    await import("../../../examples/rust-go-consumers/fixture.mjs");
  const c = (await fixtures())[0];
  const { listing_id, ...params } = c.parameters;
  for (const edit of [
    (v) => (v.packet.selection_policy = "repo-salvage/coverage-v4"),
    (v) => (v.packet.scoped_contexts[0].observation = "go-cst-names-v1"),
    (v) =>
      (v.packet.scoped_contexts[0].references[0].relation = "receiver-type"),
    (v) =>
      (v.packet.scoped_contexts[0].references[0].relation =
        "class-member-spelling"),
  ]) {
    const v = structuredClone(c.response);
    edit(v);
    await assert.rejects(
      focusEvidence(
        "http://127.0.0.1:1",
        listing_id,
        params,
        async () => new Response(JSON.stringify(v)),
      ),
    );
  }
});
