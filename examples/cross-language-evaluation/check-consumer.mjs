/** Separate acceptance of the first proposal. No source-checkout imports. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { directory, read, sha256, verifySeal } from "./suite.mjs";
const [mode] = process.argv.slice(2);
if (!["--check", "--record"].includes(mode) || process.argv.length !== 3)
  throw Error("Use --check or explicit --record");
await verifySeal("consumer-input-seal.json");
const result = await read("consumer-results.json"),
  evidence = await read("consumer-evidence.json"),
  code = await fs.readFile(path.join(directory, "consumer.mjs"), "utf8");
if (
  !result.transportSuccess ||
  result.response.code !== code ||
  !code.includes(evidence.source.commit) ||
  !code.includes(evidence.source.repository) ||
  !code.includes(evidence.notice.text.trim())
)
  throw Error("Proposal or notice mismatch");
if (
  mode === "--record" &&
  (await fs
    .stat(path.join(directory, "consumer-execution.json"))
    .catch(() => null))
)
  throw Error("Execution already recorded");
const tmp = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-class-acceptance-"),
);
await fs.chmod(tmp, 0o700);
try {
  await fs.writeFile(path.join(tmp, "consumer.mjs"), code);
  await fs.copyFile(
    path.join(directory, "consumer.test.mjs"),
    path.join(tmp, "consumer.test.mjs"),
  );
  const test = spawnSync(process.execPath, ["--test", "consumer.test.mjs"], {
    cwd: tmp,
    env: Object.fromEntries(
      ["PATH", "HOME", "TMPDIR"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    ),
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 65536,
  });
  const record = {
    format: "repo-salvage/class-consumer-execution-v1",
    codeSha256: sha256(code),
    testSha256: sha256(
      await fs.readFile(path.join(directory, "consumer.test.mjs")),
    ),
    node: process.version,
    passed: test.status === 0,
    status: test.status,
    stdout: test.stdout,
    stderr: test.stderr,
    scope:
      "First unedited proposal in an isolated workspace; six authored checks including 1000 deterministic comparisons. Only this adaptation was executed; captured upstream source stayed data.",
  };
  if (mode === "--record")
    await fs.writeFile(
      path.join(directory, "consumer-execution.json"),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx" },
    );
  console.log(test.stdout);
  if (!record.passed) process.exitCode = 1;
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
