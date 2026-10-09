/** Deliberate rubric sealing before any provider sees this corpus. */
import fs from "node:fs/promises";
import path from "node:path";
import { root, loadEngine } from "./engine.mjs";
import { buildHoldout } from "./holdout.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--freeze")
  throw Error(
    "Use --freeze before model runs; changing this seal retires the holdout epoch.",
  );
const engine = await loadEngine();
try {
  const completed = await fs
    .access(
      path.join(root, "examples/analysis-evaluation/holdout/results.json"),
    )
    .then(
      () => true,
      () => false,
    );
  if (completed)
    throw Error(
      "This holdout epoch has generated answers. Preserve it as a regression set and create a new versioned holdout; do not re-freeze it to fit results.",
    );
  const suite = await buildHoldout(engine, false);
  await fs.writeFile(
    path.join(root, "examples/analysis-evaluation/holdout/seal.json"),
    JSON.stringify(
      { frozenAt: new Date().toISOString(), seal: suite.seal },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      cases: suite.cases.length,
      coverage: suite.seal.coverage,
      modelCalls: 0,
    }),
  );
} finally {
  await engine.close();
}
