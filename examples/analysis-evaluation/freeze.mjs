import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { root, loadEngine } from "./engine.mjs";
if (process.argv[2] !== "--freeze")
  throw Error("Use --freeze only before model runs; review fixture changes.");
process.chdir(root);
const engine = await loadEngine();
try {
  const cases = JSON.parse(
    await fs.readFile(
      path.join(root, "examples/analysis-evaluation/cases.json"),
      "utf8",
    ),
  );
  const records = cases.map((c) => {
    const index = engine.indexSources(
      c.files,
      c.files.map((f) => f.path),
    );
    const packet = engine.evidencePacket(index);
    const request = engine.indexedAnalysisRequest(
      { full_name: "authored-evaluation/" + c.id },
      packet,
      c.ownerNote,
    );
    request.model = "selected-explicitly-at-run";
    const requestSha256 = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    return {
      id: c.id,
      requestSha256,
      request,
      index,
      packet,
      expectedOutcome: c.expectedOutcome,
      allowedSymbols: c.allowedSymbols,
      reviewPoints: c.reviewPoints,
    };
  });
  await fs.writeFile(
    path.join(root, "examples/analysis-evaluation/packets.json"),
    JSON.stringify(
      {
        format: "repo-salvage/analysis-evaluation-v1",
        scope:
          "Authored controls; not an unseen or independent real-repository holdout.",
        cases: records,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ frozen: records.length, modelCalls: 0 }));
} finally {
  await engine.close();
}
