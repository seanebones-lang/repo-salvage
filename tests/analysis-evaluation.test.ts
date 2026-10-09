import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { indexSources, evidencePacket } from "@/lib/source-index";
import { indexedAnalysisRequest } from "@/lib/summarize";
describe("frozen interpretation controls", () => {
  it("keeps the same evidence, prompt, schema and control identities before provider use", () => {
    const cases = JSON.parse(
      fs.readFileSync("examples/analysis-evaluation/cases.json", "utf8"),
    );
    const frozen = JSON.parse(
      fs.readFileSync("examples/analysis-evaluation/packets.json", "utf8"),
    );
    expect(frozen.cases).toHaveLength(4);
    for (const c of cases) {
      const record = frozen.cases.find((r: { id: string }) => r.id === c.id);
      const index = indexSources(
        c.files,
        c.files.map((f: { path: string }) => f.path),
      );
      const packet = evidencePacket(
        index,
        undefined,
        "repo-salvage/coverage-v1",
      );
      const request = indexedAnalysisRequest(
        { full_name: "authored-evaluation/" + c.id } as Parameters<
          typeof indexedAnalysisRequest
        >[0],
        packet,
        c.ownerNote,
        "legacy",
      );
      request.model = "selected-explicitly-at-run";
      expect(record.request).toEqual(request);
      expect(
        createHash("sha256").update(JSON.stringify(request)).digest("hex"),
      ).toBe(record.requestSha256);
      expect(record.index).toEqual(index);
      expect(record.packet).toEqual(packet);
      for (const symbol of c.allowedSymbols)
        expect(packet.targets.some((t) => t.symbol === symbol)).toBe(true);
    }
  });
});
