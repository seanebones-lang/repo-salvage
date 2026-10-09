import fs from "node:fs/promises";
import path from "node:path";
import { root, loadEngine } from "./engine.mjs";
import { buildHoldout } from "./holdout.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--freeze")
  throw Error("Use --freeze before generation.");
const directory = path.join(root, "examples/analysis-evaluation/coverage");
if (
  await fs.access(path.join(directory, "results.json")).then(
    () => true,
    () => false,
  )
)
  throw Error(
    "Completed evaluation epoch; preserve results and create a new versioned epoch.",
  );
const engine = await loadEngine();
try {
  const suite = await buildHoldout(engine, false, "coverage");
  await fs.writeFile(
    path.join(directory, "seal.json"),
    JSON.stringify(
      { frozenAt: new Date().toISOString(), seal: suite.seal },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ cases: suite.cases.length, modelCalls: 0 }));
} finally {
  await engine.close();
}
