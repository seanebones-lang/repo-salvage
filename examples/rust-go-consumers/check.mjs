/** Compiles only reviewed adaptations in disposable directories; offline stdlib only. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = new URL("./", import.meta.url),
  sha256 = (b) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2];
if (!["--record", "--check"].includes(mode) || process.argv.length !== 3)
  throw Error("Use --record once or --check for offline regression");
const bytes = await fs.readFile(new URL("input-seal.json", directory)),
  seal = JSON.parse(bytes);
for (const i of seal.inputs)
  if (sha256(await fs.readFile(new URL(i.path, directory))) !== i.sha256)
    throw Error("Frozen input changed: " + i.path);
const review = JSON.parse(
  await fs.readFile(new URL("review.json", directory), "utf8"),
);
if (review.inputSealSha256 !== sha256(bytes))
  throw Error("Review has wrong input seal");
const environment = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "salvage-rust-go-consumer-"),
);
const run = (command, args, cwd, env = environment) => {
  const r = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1048576,
  });
  if (r.status !== 0 || r.error)
    throw Error(command + " failed: " + r.stdout + r.stderr);
  return r.stdout + r.stderr;
};
const results = [];
try {
  for (const language of ["rust", "go"]) {
    const ext = language === "rust" ? "rs" : "go",
      code = await fs.readFile(
        new URL(language + "/consumer." + ext, directory),
      ),
      proposal = JSON.parse(
        await fs.readFile(
          new URL(language + "/result.json", directory),
          "utf8",
        ),
      );
    const approval = review.consumers.find((c) => c.language === language);
    if (
      !approval?.approved ||
      approval.codeSha256 !== sha256(code) ||
      proposal.inputSealSha256 !== sha256(bytes) ||
      !proposal.transportSuccess ||
      proposal.prohibitedEvents.length ||
      sha256(proposal.response.code) !== sha256(code)
    )
      throw Error("Unreviewed or changed first proposal");
    const cwd = path.join(temp, language);
    await fs.mkdir(cwd);
    await fs.copyFile(
      new URL(language + "/consumer." + ext, directory),
      path.join(cwd, "consumer." + ext),
    );
    let version, output;
    if (language === "rust") {
      await fs.copyFile(
        new URL("rust/acceptance.rs", directory),
        path.join(cwd, "acceptance.rs"),
      );
      const compiler = process.env.SALVAGE_RUSTC || "rustc";
      version = run(compiler, ["--version"], cwd).trim();
      run(
        compiler,
        ["--edition=2021", "--test", "acceptance.rs", "-o", "acceptance"],
        cwd,
      );
      output = run(path.join(cwd, "acceptance"), ["--test-threads=1"], cwd);
    } else {
      for (const name of ["consumer_test.go", "go.mod"])
        await fs.copyFile(
          new URL("go/" + name, directory),
          path.join(cwd, name),
        );
      const compiler = process.env.SALVAGE_GO || "go",
        env = {
          ...environment,
          GOTOOLCHAIN: "local",
          GOPROXY: "off",
          GOSUMDB: "off",
          GOWORK: "off",
          GOENV: "off",
          GOCACHE: path.join(temp, "go-cache"),
          GOPATH: path.join(temp, "go-path"),
        };
      version = run(compiler, ["version"], cwd, env).trim();
      output = run(compiler, ["test", "-count=1", "-v", "."], cwd, env);
    }
    results.push({
      language,
      status: "passed",
      compiler: version,
      codeSha256: sha256(code),
      output,
    });
  }
  if (mode === "--record")
    await fs.writeFile(
      new URL("execution.json", directory),
      JSON.stringify(
        {
          format: "repo-salvage/rust-go-consumer-execution-v1",
          at: new Date().toISOString(),
          inputSealSha256: sha256(bytes),
          reviewSha256: sha256(
            await fs.readFile(new URL("review.json", directory)),
          ),
          scope:
            "Only inspected standalone adaptations compiled/executed; no captured upstream module execution. Operator-reviewed, not blind.",
          results,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
  console.log(
    JSON.stringify({
      checks: results.map((r) => ({
        language: r.language,
        status: r.status,
        compiler: r.compiler,
      })),
      scope: "Frozen adapted contracts; no upstream certification",
    }),
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
