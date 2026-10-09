/** Two pre-frozen diagnostic rechecks; preserve the failed original trial. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { directory, root, loadSuite, sha256 } from "../suite.mjs";
import { runNativeTrials } from "../host.mjs";
export const followupFiles = [
  "host.mjs",
  "language-followup-v2/run.mjs",
  "language-followup-v2/tasks.json",
];
export async function loadFollowup({ archive = false } = {}) {
  const base = await loadSuite();
  const sealBytes = await fs.readFile(new URL("./seal.json", import.meta.url));
  const seal = JSON.parse(sealBytes);
  if (seal.baseSealSha256 !== sha256(base.sealBytes))
    throw Error("Original trial changed.");
  for (const name of followupFiles)
    if (
      sha256(await fs.readFile(path.join(directory, name))) !==
      seal.files.find((f) => f.name === name)?.sha256
    )
      throw Error("Frozen follow-up changed: " + name);
  const tasks = JSON.parse(
    await fs.readFile(new URL("./tasks.json", import.meta.url), "utf8"),
  );
  if (
    tasks.instructions !== base.suite.instructions ||
    tasks.cases.length !== 2 ||
    JSON.stringify(tasks.cases) !==
      JSON.stringify(
        base.suite.cases.filter((c) => c.expectedAnswer === "NO_MATCH"),
      )
  )
    throw Error("Diagnostic questions or rubrics changed.");
  const archiveBytes = archive
    ? await fs.readFile(path.join(root, "public/repo-salvage-mcp.tgz"))
    : null;
  if (archive && sha256(archiveBytes) !== seal.archiveSha256)
    throw Error("Follow-up MCP archive changed.");
  return { ...base, suite: tasks, seal, sealBytes, archiveBytes };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const [mode, origin, model, effort] = process.argv.slice(2);
  if (
    mode !== "--run" ||
    process.argv.length !== 6 ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    origin.endsWith(":3187") ||
    !model ||
    !["low", "medium", "high"].includes(effort)
  )
    throw Error(
      "Explicit account use: --run EVALUATION_LOOPBACK_ORIGIN MODEL low|medium|high",
    );
  const frozen = await loadFollowup({ archive: true });
  const { results } = await runNativeTrials({
    ...frozen,
    origin,
    model,
    effort,
  });
  if (results.length !== 2 || results.some((r) => !r.score.passed))
    process.exitCode = 1;
}
