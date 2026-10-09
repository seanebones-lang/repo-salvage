/** Execute only hash-bound reviewed adaptations, offline, in a disposable workspace. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { directory, read, verifyInputs, verifyProposal } from "./common.mjs";
import { sha } from "./evidence.mjs";
const mode = process.argv[2];
if (!["--record", "--check"].includes(mode) || process.argv.length !== 3)
  throw Error("Use --record once or --check");
if (
  mode === "--record" &&
  (await fs.stat(new URL("execution.json", directory)).catch(() => null))
)
  throw Error("Execution already retained");
const seal = await verifyInputs(),
  review = await read("review.json");
if (review.inputSealSha256 !== seal) throw Error("Review input seal changed");
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-cross-file-consumer-"),
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
  for (const language of ["rust", "go"]) {
    const { code } = await verifyProposal(language),
      approval = review.consumers.find((c) => c.language === language);
    if (!approval?.approved || approval.codeSha256 !== sha(code))
      throw Error("Unreviewed source");
    const cwd = path.join(temp, language);
    await fs.mkdir(cwd);
    await fs.writeFile(
      path.join(cwd, "consumer." + (language === "rust" ? "rs" : "go")),
      code,
    );
    const result = { language, codeSha256: sha(code), status: "failed" };
    try {
      if (language === "rust") {
        await fs.copyFile(
          new URL("rust/acceptance.rs", directory),
          path.join(cwd, "acceptance.rs"),
        );
        const compiler = process.env.SALVAGE_RUSTC || "rustc";
        result.compiler = run(compiler, ["--version"], cwd).trim();
        result.output = [];
        for (const optimized of [false, true]) {
          const flags = optimized
            ? ["-O", "-C", "overflow-checks=no"]
            : ["-C", "overflow-checks=yes"];
          run(
            compiler,
            [
              "--edition=2021",
              "--test",
              "acceptance.rs",
              ...flags,
              "-o",
              "acceptance",
            ],
            cwd,
          );
          result.output.push({
            optimized,
            output: run(
              path.join(cwd, "acceptance"),
              ["--test-threads=1"],
              cwd,
            ),
          });
        }
      } else {
        for (const name of ["acceptance_test.go", "go.mod", "vectors.json"])
          await fs.copyFile(
            new URL("go/" + name, directory),
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
        result.compiler = run(compiler, ["version"], cwd, environment).trim();
        result.output = run(
          compiler,
          ["test", "-count=1", "-v", "."],
          cwd,
          environment,
        );
      }
      result.status = "passed";
    } catch (error) {
      result.error = String(error);
    }
    results.push(result);
  }
  if (mode === "--record")
    await fs.writeFile(
      new URL("execution.json", directory),
      JSON.stringify(
        {
          format: "repo-salvage/cross-file-consumer-execution-v1",
          at: new Date().toISOString(),
          inputSealSha256: seal,
          reviewSha256: sha(
            await fs.readFile(new URL("review.json", directory)),
          ),
          scope:
            "Only operator-reviewed standalone adaptations executed; upstream captures remain data; no provider calls during acceptance",
          results,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  console.log(JSON.stringify(results));
  if (results.some((r) => r.status !== "passed"))
    throw Error("Acceptance failed; first result preserved");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
