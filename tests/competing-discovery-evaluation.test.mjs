import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadSuite,
  hydrateControls,
  validateSources,
} from "../examples/competing-discovery-evaluation/suite.mjs";
import {
  inspectTrace,
  scoreCase,
} from "../examples/competing-discovery-evaluation/score.mjs";
import { loadFollowup } from "../examples/competing-discovery-evaluation/language-followup-v2/run.mjs";
const directory = new URL(
  "../examples/competing-discovery-evaluation/",
  import.meta.url,
);
const read = async (name) =>
  JSON.parse(await fs.readFile(new URL(name, directory), "utf8"));
const corpus = await read("corpus.json"),
  rawControls = await read("controls.json"),
  suite = await read("cases.json");
const controls = hydrateControls(rawControls, corpus);
const positive = suite.cases.find((c) => c.id === "clear-and-settle"),
  negative = suite.cases.find((c) => c.id === "force-stop-running");
const event = (tool, value, args = {}) => ({
  type: "item.completed",
  item: {
    type: "mcp_tool_call",
    server: "repo_salvage",
    tool,
    arguments: args,
    status: "completed",
    result: { structured_content: value },
  },
});
function evidence(key, index) {
  const s = controls.sources.find((s) => s.key === key),
    source = { repository: s.repository, commit: s.commit },
    ids = { listing_id: index + 1001, part_id: "a".repeat(16) };
  const events = [
    event("repo_salvage_inspect_part", {
      ...ids,
      source,
      files: [{ path: s.path, git_blob_sha: s.blobSha }],
    }),
  ];
  for (let offset = 0; offset < s.content.length; offset += 12000)
    events.push(
      event("repo_salvage_read_part_file", {
        ...ids,
        source,
        file: { path: s.path, sha256: s.sha256, git_blob_sha: s.blobSha },
        offset,
        text: s.content.slice(offset, offset + 12000),
      }),
    );
  events.push(
    event("repo_salvage_read_part_file", {
      ...ids,
      source,
      file: { path: s.notice.path, sha256: s.notice.sha256 },
      offset: 0,
      text: s.notice.content,
    }),
  );
  return events;
}
const events = (c) => [
  event("repo_salvage_search_parts", {}, { limit: 8 }),
  ...c.requiredEvidence.flatMap(evidence),
  { type: "turn.completed" },
];
const score = (c, entries = events(c)) =>
  scoreCase(
    { answer: c.expectedAnswer },
    inspectTrace(entries.map(JSON.stringify).join("\n"), 0),
    c,
    controls,
  );
test("competing discovery retains its pre-run corpus, cases, controls, catalog and harness seals", async () => {
  const frozen = await loadSuite();
  assert.equal(frozen.catalog.pagination.total, 40);
  assert.equal(frozen.suite.cases.length, 10);
});
test("language follow-up preserves both original questions and source rubrics under its own seal", async () => {
  const frozen = await loadFollowup();
  assert.equal(frozen.suite.cases.length, 2);
  assert.ok(frozen.suite.cases.every((c) => c.expectedAnswer === "NO_MATCH"));
});
test("the follow-up operator entry point refuses missing model authorization arguments", () => {
  const script = fileURLToPath(
    new URL(
      "../examples/competing-discovery-evaluation/language-followup-v2/run.mjs",
      import.meta.url,
    ),
  );
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: 5000,
    env: {},
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Explicit account use/);
});
test("all captured code and retained notices match complete Git blobs", () => {
  validateSources(corpus);
  const bad = structuredClone(corpus);
  bad.repositories[0].files[0].content += "tampered";
  assert.throws(() => validateSources(bad));
});
test("all ten cases can be scored from their required pinned source and notices", () => {
  for (const c of suite.cases) assert.equal(score(c).passed, true, c.id);
});
test("correct repository and path at a different commit fail evidence binding", () => {
  const entries = events(positive);
  for (const e of entries)
    if (e.item?.result.structured_content.source)
      e.item.result.structured_content.source.commit = "0".repeat(40);
  assert.equal(score(positive, entries).passed, false);
});
test("inspection of a different listing cannot validate retrieved source", () => {
  const entries = events(positive);
  entries.find((e) => e.item?.tool === "repo_salvage_inspect_part").item.result
    .structured_content.listing_id++;
  assert.equal(score(positive, entries).passed, false);
});
test("matching metadata cannot hide changed source bytes or a false offset", () => {
  for (const change of [
    (v) => {
      v.text += "wrong";
    },
    (v) => {
      v.offset++;
    },
    (v) => {
      v.file.sha256 = "0".repeat(64);
    },
  ]) {
    const entries = events(positive);
    change(
      entries.find((e) => e.item?.tool === "repo_salvage_read_part_file").item
        .result.structured_content,
    );
    assert.equal(score(positive, entries).passed, false);
  }
});
test("a recommendation needs the complete matching notice", () => {
  const entries = events(positive);
  entries.find(
    (e) => e.item?.result.structured_content.file?.path === "license",
  ).item.result.structured_content.text = "MIT";
  assert.equal(score(positive, entries).passed, false);
});
test("NO_MATCH requires source for all three relevant competitors", () => {
  const entries = events(negative).filter(
    (e) =>
      e.item?.result.structured_content.source?.repository !==
      "sindresorhus/p-queue",
  );
  assert.equal(score(negative, entries).passed, false);
});
test("reading a queue's first window is insufficient to establish its abort behavior", () => {
  const entries = events(negative).filter(
    (e) =>
      !(
        e.item?.tool === "repo_salvage_read_part_file" &&
        e.item.result.structured_content.source.repository ===
          "sindresorhus/p-queue" &&
        e.item.result.structured_content.offset > 0
      ),
  );
  assert.equal(score(negative, entries).passed, false);
});
test("focused source blocks must contain frozen behavior evidence and match their bytes", () => {
  const s = controls.sources.find(
    (s) => s.key === positive.requiredEvidence[0],
  );
  const entries = events(positive);
  const i = entries.findIndex(
    (e) => e.item?.result.structured_content.file?.path === s.path,
  );
  const v = entries[i].item.result.structured_content;
  entries[i] = event("repo_salvage_focus_evidence", {
    listing_id: v.listing_id,
    source: v.source,
    packet: {
      references: [{ path: s.path, content: s.content, sha256: s.sha256 }],
    },
  });
  assert.equal(score(positive, entries).passed, true);
  entries[i].item.result.structured_content.packet.references[0].sha256 =
    "0".repeat(64);
  assert.equal(score(positive, entries).passed, false);
});
test("unbounded searches and incomplete native turns cannot earn a pass", () => {
  const entries = events(positive);
  entries[0].item.arguments.limit = 50;
  assert.equal(score(positive, entries).passed, false);
  assert.equal(score(positive, events(positive).slice(0, -1)).passed, false);
});
