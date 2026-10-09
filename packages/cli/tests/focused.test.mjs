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
