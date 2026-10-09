/** Protocol fixture derived from sealed source; synthetic local routing IDs, no catalog write. */
import { loadSuite } from "./suite.mjs";
import { loadEngine } from "./engine.mjs";
import assert from "node:assert/strict";
export async function focusedFixture() {
  const suite = await loadSuite();
  const c = suite.cases.find((c) => c.id === "humanize-focused");
  const repo = suite.corpus.repositories.find((r) => r.repo === c.repository);
  const files = repo.files.filter((f) =>
    [c.path, "src/humanize/i18n.py", "LICENCE", "pyproject.toml"].includes(
      f.path,
    ),
  );
  const e = await loadEngine({ historical: true });
  try {
    const index = e.indexSources(files, repo.knownPaths, []);
    const targets = index.targets.filter(
      (t) => t.path === c.path && t.symbol === c.symbol,
    );
    const packet = e.evidencePacket({ ...index, targets }, c.packetCharacters);
    assert.deepEqual(packet, c.packet);
    const file = repo.files.find((f) => f.path === c.path);
    const coverage = {
      matched_files: 1,
      inspected_files: files.length,
      source_bytes: files.reduce((n, f) => n + Buffer.byteLength(f.content), 0),
      indexed_targets: targets.length,
      supplied_targets: packet.targets.length,
      context_paths: files.filter((f) => f.path !== c.path).map((f) => f.path),
      files: [
        {
          path: c.path,
          size_bytes: Buffer.byteLength(file.content),
          download_url: `https://raw.githubusercontent.com/${repo.repo}/${repo.commit}/${c.path}`,
          git_blob_sha: file.blobSha,
          inspection: "complete",
          reason: null,
          indexed_targets: targets.length,
          supplied_targets: packet.targets.length,
          same_file_supplied: false,
        },
      ],
      skipped: [],
      skipped_details_omitted: 0,
    };
    const response = e.focusedResponse(
      {
        id: 990,
        github_repo_id: repo.metadata.id,
        owner_id: 99001,
        full_name: repo.repo,
        source_sha: repo.commit,
      },
      {
        focus: {
          path: c.path,
          symbol: c.symbol,
          symbol_match: "matched",
          packet_character_limit: c.packetCharacters,
        },
        coverage,
        packet,
      },
    );
    return {
      parameters: {
        listing_id: 990,
        path: c.path,
        symbol: c.symbol,
        max_characters: c.packetCharacters,
      },
      response,
    };
  } finally {
    await e.close();
  }
}
