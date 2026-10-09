/** Only operator-reviewed positive adaptations can reach a compiler; negative turns are skipped. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  directory,
  read,
  sha,
  verifyInputs,
  verifiedResult,
} from "./suite.mjs";
const mode = process.argv[2];
if (!["--record", "--check"].includes(mode) || process.argv.length !== 3)
  throw Error("Use --record once or --check");
if (
  mode === "--record" &&
  (await fs.stat(new URL("execution.json", directory)).catch(() => null))
)
  throw Error("Execution retained already");
const seal = await verifyInputs(),
  review = await read("review.json");
if (review.inputSealSha256 !== seal) throw Error("Review seal changed");
const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-context-recovery-"),
  ),
  env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  ),
  results = [];
function run(cmd, args, cwd, environment = env) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1048576,
  });
  if (r.status !== 0 || r.error)
    throw Error(cmd + " failed: " + r.stdout + r.stderr + (r.error || ""));
  return r.stdout + r.stderr;
}
try {
  for (const c of await read("controls.json")) {
    const { result } = await verifiedResult(c),
      approval = review.cases.find((a) => a.id === c.id);
    if (
      !approval?.accepted ||
      approval.responseSha256 !== sha(JSON.stringify(result.response))
    )
      throw Error("Unreviewed turn");
    if (c.expectedDecision === "needs_context") {
      if (approval.approvedForExecution)
        throw Error("Negative turn authorized for execution");
      results.push({
        id: c.id,
        status: "needs_context",
        compiled: false,
        executed: false,
      });
      continue;
    }
    const code = await fs.readFile(
      new URL(
        c.id + "/consumer." + (c.language === "rust" ? "rs" : "go"),
        directory,
      ),
    );
    if (
      !approval.approvedForExecution ||
      approval.codeSha256 !== sha(code) ||
      sha(result.response.code) !== sha(code)
    )
      throw Error("Unreviewed code");
    const cwd = path.join(temp, c.id);
    await fs.mkdir(cwd);
    await fs.writeFile(
      path.join(cwd, "consumer." + (c.language === "rust" ? "rs" : "go")),
      code,
    );
    const record = {
      id: c.id,
      status: "failed",
      codeSha256: sha(code),
      compiled: false,
      executed: false,
    };
    try {
      if (c.language === "rust") {
        await fs.copyFile(
          new URL(c.id + "/acceptance.rs", directory),
          path.join(cwd, "acceptance.rs"),
        );
        const compiler = process.env.SALVAGE_RUSTC || "rustc";
        record.compiler = run(compiler, ["--version"], cwd).trim();
        record.output = [];
        for (const optimize of [false, true]) {
          run(
            compiler,
            [
              "--edition=2021",
              "--test",
              "acceptance.rs",
              ...(optimize
                ? ["-O", "-C", "overflow-checks=no"]
                : ["-C", "overflow-checks=yes"]),
              "-o",
              "acceptance",
            ],
            cwd,
          );
          record.compiled = true;
          record.output.push({
            optimize,
            output: run(
              path.join(cwd, "acceptance"),
              ["--test-threads=1"],
              cwd,
            ),
          });
          record.executed = true;
        }
      } else {
        for (const name of ["acceptance_test.go", "go.mod", "vectors.json"])
          await fs.copyFile(
            new URL(c.id + "/" + name, directory),
            path.join(cwd, name),
          );
        const compiler = process.env.SALVAGE_GO || "go",
          environment = {
            ...env,
            GOTOOLCHAIN: "local",
            GOPROXY: "off",
            GOSUMDB: "off",
            GOWORK: "off",
            GOENV: "off",
            GOCACHE: path.join(temp, "go-cache"),
            GOPATH: path.join(temp, "go-path"),
          };
        record.compiler = run(compiler, ["version"], cwd, environment).trim();
        record.output = run(
          compiler,
          ["test", "-count=1", "-v", "."],
          cwd,
          environment,
        );
        record.compiled = true;
        record.executed = true;
      }
      record.status = "passed";
    } catch (error) {
      record.error = String(error);
    }
    results.push(record);
  }
  if (mode === "--record")
    await fs.writeFile(
      new URL("execution.json", directory),
      JSON.stringify(
        {
          format: "repo-salvage/context-recovery-execution-v1",
          at: new Date().toISOString(),
          inputSealSha256: seal,
          reviewSha256: sha(
            await fs.readFile(new URL("review.json", directory)),
          ),
          scope:
            "Only reviewed standalone controls executed; authored upstream fixtures stay parser input; negative turns never compiled; no provider calls",
          results,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  console.log(JSON.stringify(results));
  if (results.some((r) => r.status === "failed"))
    throw Error("First adaptation failed acceptance; retained");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
