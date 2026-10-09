import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  inspectTrace,
  scoreDiscovery,
} from "../examples/discovery-evaluation/trace.mjs";
const expected = "owner/repo:lib/part.py";
test("the consumer and retained notice match the archived, unedited adaptation", () => {
  const result = JSON.parse(
    fs.readFileSync(
      "examples/discovery-evaluation/adaptation-results.json",
      "utf8",
    ),
  );
  const code = fs.readFileSync("examples/prose-consumer/prose.py", "utf8");
  assert.equal(code, result.results[0].answer.code);
  for (const [file, key] of [
    ["prose.py", "codeSha256"],
    ["notices/LICENSE", "noticeSha256"],
  ])
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync("examples/prose-consumer/" + file))
        .digest("hex"),
      result.consumerAcceptance[key],
    );
});
test("discovery cases, source controls, catalog and adaptation acceptance checks retain their pre-run seals", () => {
  const directory = "examples/discovery-evaluation/";
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const seal = JSON.parse(fs.readFileSync(directory + "seal.json", "utf8"));
  for (const [name, key] of [
    ["cases.json", "casesSha256"],
    ["catalog.json", "catalogSha256"],
    ["controls.json", "controlsSha256"],
  ])
    assert.equal(sha(fs.readFileSync(directory + name)), seal[key]);
  const suite = JSON.parse(fs.readFileSync(directory + "cases.json", "utf8"));
  assert.equal(suite.cases.length, 10);
  assert.equal(
    suite.cases.filter((c) => c.expectedAnswer === "NO_MATCH").length,
    2,
  );
  const taskSeal = JSON.parse(
    fs.readFileSync(directory + "adaptation-seal.json", "utf8"),
  );
  assert.equal(
    sha(fs.readFileSync(directory + "adaptation-task.md")),
    taskSeal.taskSha256,
  );
  assert.equal(
    sha(fs.readFileSync("examples/prose-consumer/test_prose.py")),
    taskSeal.consumerTestsSha256,
  );
});
const item = (tool, value = {}) => ({
  type: "item.completed",
  item: {
    type: "mcp_tool_call",
    server: "repo_salvage",
    tool,
    arguments: {},
    status: "completed",
    result: { structured_content: value },
  },
});
const events = [
  item("repo_salvage_search_parts"),
  item("repo_salvage_inspect_part"),
  item("repo_salvage_read_part_file", {
    source: { repository: "owner/repo" },
    file: { path: "lib/part.py" },
    text: "def part(): pass",
  }),
  { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
];
const trace = (entries = events, code = 0, timeout = false) =>
  inspectTrace(entries.map(JSON.stringify).join("\n"), code, timeout);
test("native snake-case structured source binds a correct discovery to its repository and path", () => {
  assert.equal(
    scoreDiscovery({ answer: expected }, trace(), expected).passed,
    true,
  );
});
test("same file path in another repository cannot satisfy source evidence", () => {
  const entries = structuredClone(events);
  entries[2].item.result.structured_content.source.repository = "other/repo";
  assert.equal(
    scoreDiscovery({ answer: expected }, trace(entries), expected).passed,
    false,
  );
});
test("focused evidence requires a supplied block from the requested file, not just a notice", () => {
  const entries = structuredClone(events);
  entries[2] = item("repo_salvage_focus_evidence", {
    source: { repository: "owner/repo" },
    focus: { path: "lib/part.py" },
    packet: { references: [{ path: "LICENSE", content: "MIT" }] },
  });
  assert.equal(
    scoreDiscovery({ answer: expected }, trace(entries), expected).passed,
    false,
  );
  entries[2].item.result.structured_content.packet.references.push({
    path: "lib/part.py",
    content: "def part(): pass",
  });
  assert.equal(
    scoreDiscovery({ answer: expected }, trace(entries), expected).passed,
    true,
  );
});
test("an exact answer without search and inspection is insufficient", () => {
  assert.equal(
    scoreDiscovery({ answer: expected }, trace(events.slice(2)), expected)
      .passed,
    false,
  );
});
test("NO_MATCH still requires inspecting real source and does not earn credit from search alone", () => {
  assert.equal(
    scoreDiscovery({ answer: "NO_MATCH" }, trace(), "NO_MATCH").passed,
    true,
  );
  assert.equal(
    scoreDiscovery(
      { answer: "NO_MATCH" },
      trace(events.filter((_, i) => i !== 2)),
      "NO_MATCH",
    ).passed,
    false,
  );
});
test("tool errors cannot masquerade as successful source evidence", () => {
  for (const field of ["isError", "is_error"]) {
    const entries = structuredClone(events);
    entries[2].item.result[field] = true;
    assert.equal(
      scoreDiscovery({ answer: expected }, trace(entries), expected).passed,
      false,
    );
  }
});
test("incomplete, failed, malformed and timed-out turns fail closed", () => {
  assert.equal(trace(events.slice(0, -1)).transportSuccess, false);
  assert.equal(trace(events, 1).transportSuccess, false);
  assert.equal(trace(events, 0, true).transportSuccess, false);
  assert.equal(inspectTrace("garbage", 0).transportSuccess, false);
  assert.equal(
    trace([...events, { type: "turn.failed" }]).transportSuccess,
    false,
  );
});
test("shell, file edits, unrelated MCP tools and unknown item events are prohibited", () => {
  for (const type of ["command_execution", "file_change", "unknown"]) {
    assert.equal(
      trace([...events, { type: "item.started", item: { type } }])
        .transportSuccess,
      false,
    );
  }
  const entries = structuredClone(events);
  entries[2].item.server = "another_server";
  assert.equal(trace(entries).transportSuccess, false);
  entries[2].item.server = "repo_salvage";
  entries[2].item.tool = "repo_salvage_prepare_draft";
  assert.equal(trace(entries).transportSuccess, false);
});
