import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { root } from "./engine.mjs";
import { baselinePacket, baselineSystem } from "./baseline.mjs";
import { targetKey } from "./scoring.mjs";
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function buildHoldout(engine, verify = true, epoch = "holdout") {
  if (!["holdout", "coverage"].includes(epoch))
    throw Error("Unknown evaluation epoch.");
  const directory = path.join(root, "examples/analysis-evaluation", epoch);
  const corpusBytes = await fs.readFile(path.join(directory, "corpus.json"));
  const caseBytes = await fs.readFile(path.join(directory, "cases.json"));
  const corpus = JSON.parse(corpusBytes);
  const definitions = JSON.parse(caseBytes);
  const repositories = new Map();
  for (const repo of corpus.repositories) {
    if (repo.license !== "MIT" || !/^[a-f0-9]{40}$/.test(repo.commit))
      throw Error("Invalid frozen provenance.");
    for (const file of repo.files) {
      const body = Buffer.from(file.content);
      const blob = createHash("sha1")
        .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
        .digest("hex");
      if (file.truncated || blob !== file.blobSha)
        throw Error("Captured source does not match its Git blob.");
    }
    const index = engine.indexSources(
      repo.files,
      repo.knownPaths,
      repo.skipped,
    );
    index.inspection = repo.inspection;
    repositories.set(repo.repo, {
      repo,
      index,
      packet:
        epoch === "holdout"
          ? baselinePacket(index)
          : engine.evidencePacket(index),
    });
  }
  const cases = definitions.cases.map((c) => {
    const data = repositories.get(c.repo);
    if (!data || !/^[a-z0-9-]+$/.test(c.id))
      throw Error("Invalid case identity.");
    const { index, packet } = data;
    const available = new Set(packet.targets.map(targetKey));
    const e = c.expectation;
    if (
      !e.allowedTargets.every((t) => available.has(t)) ||
      !e.requiredGroups.every(
        (group) =>
          group.length && group.every((t) => e.allowedTargets.includes(t)),
      ) ||
      !["candidates", "no_candidates"].includes(e.outcome) ||
      e.minCandidates < 0 ||
      e.maxCandidates > 6 ||
      e.minCandidates > e.maxCandidates
    )
      throw Error("Unscorable frozen expectations.");
    const request = engine.indexedAnalysisRequest(
      { full_name: c.repo },
      packet,
      c.ownerNote,
    );
    if (epoch === "holdout") request.system = baselineSystem;
    request.model = "selected-explicitly-at-run";
    return {
      ...c,
      index,
      packet,
      request,
      requestSha256: sha256(JSON.stringify(request)),
    };
  });
  if (new Set(cases.map((c) => c.id)).size !== cases.length || cases.length > 8)
    throw Error("Invalid or excessive evaluation batch.");
  const coverage = definitions.coverageProbes.map((probe) => {
    const data = repositories.get(probe.repo);
    if (!data) throw Error("Unknown coverage repository.");
    const key = targetKey(probe);
    return {
      ...probe,
      inspected: data.repo.files.some((f) => f.path === probe.path),
      indexed: data.index.targets.some((t) => targetKey(t) === key),
      supplied: data.packet.targets.some((t) => targetKey(t) === key),
      ...(epoch === "coverage"
        ? {
            sameFileContext: data.packet.references.some(
              (r) => r.path === probe.path && r.kind === "file",
            ),
          }
        : {}),
    };
  });
  const seal = {
    corpusSha256: sha256(corpusBytes),
    casesSha256: sha256(caseBytes),
    requests: cases.map(({ id, requestSha256 }) => ({ id, requestSha256 })),
    coverage,
  };
  if (verify) {
    const frozen = JSON.parse(
      await fs.readFile(path.join(directory, "seal.json"), "utf8"),
    );
    if (JSON.stringify(seal) !== JSON.stringify(frozen.seal))
      throw Error(
        "Frozen corpus, rubric or production request changed; stop before provider use.",
      );
  }
  return {
    format:
      epoch === "holdout"
        ? "repo-salvage/real-source-evaluation-v1"
        : "repo-salvage/coverage-evaluation-v1",
    scope:
      epoch === "holdout"
        ? "Eight author-constrained cases on two public MIT repositories; implementing-agent rubric, not independent review or whole-repository recall."
        : "Four known-repository regression cases under the coverage policy; implementing-agent review, not unseen discovery or independent assessment.",
    seal,
    cases,
  };
}
