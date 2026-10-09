import { spawnSync } from "node:child_process";
import path from "node:path";

export type PythonSupportCandidate = {
  symbol: string;
  start_byte: number;
  end_byte: number;
  kind: "declaration" | "statement";
  relation:
    | "module-name"
    | "module-configuration"
    | "enclosing-class"
    | "class-member-spelling";
  fallback_members?: PythonSupportCandidate[];
  fallback_members_omitted?: number;
};

export type PythonParse = {
  path: string;
  status: "ok" | "parse_error" | "unsupported_encoding" | "unavailable";
  declarations: {
    symbol: string;
    start_byte: number;
    end_byte: number;
    context: string | null;
  }[];
  imports: { specifier: string; dynamic: boolean }[];
  support_graph?: (Omit<PythonSupportCandidate, "relation"> & {
    candidates: PythonSupportCandidate[];
    gaps: { symbol: string; reason: string }[];
    observations_omitted: number;
  })[];
};

/** Isolated trusted parser process; source is stdin data, never an executable path. */
export function parsePythonFiles(
  inputs: { path: string; content: string; truncated?: boolean }[],
) {
  let bytes = 0;
  const files = inputs
    .filter((file) => {
      const size = Buffer.byteLength(file.content);
      if (
        !file.path.endsWith(".py") ||
        file.truncated ||
        size > 128_000 ||
        bytes + size > 2_000_000
      )
        return false;
      bytes += size;
      return true;
    })
    .slice(0, 64);
  const unavailable = () =>
    new Map(
      files.map((f) => [
        f.path,
        {
          path: f.path,
          status: "unavailable",
          declarations: [],
          imports: [],
        } as PythonParse,
      ]),
    );
  if (!files.length) return new Map<string, PythonParse>();
  const result = spawnSync(
    "python3",
    ["-I", "-S", "-X", "utf8", path.resolve("scripts/python-index.py")],
    {
      input: JSON.stringify(
        files.map(({ path, content }) => ({ path, content })),
      ),
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 4_000_000,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        LANG: "C.UTF-8",
        NODE_ENV: process.env.NODE_ENV,
      },
    },
  );
  if (result.status !== 0 || result.error) return unavailable();
  try {
    const output = JSON.parse(result.stdout);
    if (
      output.format !== "repo-salvage/python-ast-v1" ||
      !Array.isArray(output.files) ||
      output.files.length !== files.length
    )
      return unavailable();
    return new Map<string, PythonParse>(
      output.files.map((file: PythonParse) => [file.path, file]),
    );
  } catch {
    return unavailable();
  }
}
