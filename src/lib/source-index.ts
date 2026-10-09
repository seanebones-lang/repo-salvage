import { createHash } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import { parsePythonFiles } from "./python-parser";

export const INDEX_VERSION = "repo-salvage/source-index-v2";
export const INDEX_LIMITS = {
  files: 64,
  initialFiles: 48,
  initialMetadataFiles: 12,
  followupFiles: 16,
  initialBytes: 1_500_000,
  inspectionMilliseconds: 120_000,
  fileBytes: 128_000,
  totalBytes: 2_000_000,
  promptCharacters: 70_000,
  candidates: 24,
};
export type IndexedInput = {
  path: string;
  content: string;
  truncated?: boolean;
};
export type SourceReference = {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  sha256: string;
  kind: "declaration" | "file";
  content: string;
};
export type ImportEvidence = {
  specifier: string;
  kind: "local" | "external" | "unresolved" | "dynamic";
  resolved_path: string | null;
};
export type SourceTarget = {
  id: string;
  path: string;
  symbol: string;
  kind: "declaration" | "file";
  reference_id: string;
  imports: ImportEvidence[];
  supporting_paths: string[];
  unresolved: string[];
  test_paths: string[];
  notice_paths: string[];
};
export type SourceIndex = {
  format: typeof INDEX_VERSION;
  files: {
    path: string;
    sha256: string;
    coverage: "complete" | "prefix";
    parser: "typescript" | "python" | "file" | "parse_error";
    imports: ImportEvidence[];
  }[];
  targets: SourceTarget[];
  references: SourceReference[];
  skipped: { path: string; reason: string }[];
  inspection?: {
    initial_paths: string[];
    followup_paths: string[];
    fill_paths: string[];
    deadline_reached: boolean;
  };
};
export type EvidencePacket = {
  format: typeof INDEX_VERSION;
  targets: SourceTarget[];
  references: SourceReference[];
  omitted_targets: number;
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const isCodePath = (file: string) =>
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|php|cs|c|cpp|h|sh|sql|vue|svelte)$/i.test(
    file,
  ) && !/\.d\.ts$/i.test(file);
export const isTestPath = (file: string) =>
  /(^|\/)(__tests__|tests?|specs?)\/|[._-](test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$/i.test(
    file,
  );
export const isNoticePath = (file: string) =>
  /(^|\/)(licen[sc]es?|copying|notice|copyright)(?:$|[._/-])/i.test(file);
export const isManifestPath = (file: string) =>
  /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle|tsconfig\.json)$/i.test(
    file,
  );
export const safeSourcePath = (file: string) =>
  file.length <= 512 &&
  !/[\\\x00-\x1f\x7f:]/.test(file) &&
  file.split("/").every((s) => s && s !== "." && s !== "..");

function resolveImport(
  file: string,
  specifier: string,
  known: Set<string>,
): ImportEvidence {
  if (!specifier.startsWith("."))
    return {
      specifier,
      kind:
        specifier.startsWith("@/") ||
        specifier.startsWith("~/") ||
        specifier.startsWith("#") ||
        specifier.startsWith("/")
          ? "unresolved"
          : "external",
      resolved_path: null,
    };
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(file), specifier),
  );
  const choices = [
    base,
    ...[
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      "/index.ts",
      "/index.tsx",
      "/index.js",
    ].map((ext) => base + ext),
  ];
  if (/\.m?js$/.test(base))
    choices.push(base.replace(/\.m?js$/, ".ts"), base.replace(/\.js$/, ".tsx"));
  const resolved = choices.find(
    (candidate) => safeSourcePath(candidate) && known.has(candidate),
  );
  return {
    specifier,
    kind: resolved ? "local" : "unresolved",
    resolved_path: resolved ?? null,
  };
}

function resolvePythonImport(
  file: string,
  specifier: string,
  known: Set<string>,
): ImportEvidence {
  const relative = specifier.match(/^\.+/)?.[0].length ?? 0;
  const module = specifier.slice(relative).split(".").join("/");
  const parents =
    path.posix.dirname(file) === "." ? [] : path.posix.dirname(file).split("/");
  if (relative > parents.length + 1)
    return { specifier, kind: "unresolved", resolved_path: null };
  const prefix = relative
    ? parents.slice(0, parents.length - relative + 1).join("/")
    : "";
  const stems = relative
    ? [path.posix.join(prefix, module)]
    : [module, "src/" + module];
  const choices = [
    ...new Set(stems.flatMap((stem) => [stem + ".py", stem + "/__init__.py"])),
  ].filter((candidate) => safeSourcePath(candidate) && known.has(candidate));
  return {
    specifier,
    kind:
      choices.length === 1
        ? "local"
        : relative || choices.length > 1
          ? "unresolved"
          : "external",
    resolved_path: choices.length === 1 ? choices[0] : null,
  };
}

/** Parse source only: no project configuration, package installation or execution. */
export function indexSources(
  inputs: IndexedInput[],
  knownPaths: string[],
  skipped: SourceIndex["skipped"] = [],
): SourceIndex {
  const index: SourceIndex = {
    format: INDEX_VERSION,
    files: [],
    targets: [],
    references: [],
    skipped: [...skipped],
  };
  const known = new Set(knownPaths);
  const python = parsePythonFiles(inputs);
  let inputBytes = 0;
  for (const file of [...inputs].sort((a, b) => a.path.localeCompare(b.path))) {
    const size = Buffer.byteLength(file.content);
    const allowance =
      index.files.length >= INDEX_LIMITS.files
        ? "file_count_limit"
        : size > INDEX_LIMITS.fileBytes
          ? "file_byte_limit"
          : inputBytes + size > INDEX_LIMITS.totalBytes
            ? "repository_byte_limit"
            : null;
    if (allowance) {
      index.skipped.push({ path: file.path, reason: allowance });
      continue;
    }
    inputBytes += size;
    if (!safeSourcePath(file.path)) {
      index.skipped.push({ path: file.path, reason: "unsupported_path" });
      continue;
    }
    const hash = digest(file.content);
    const typed = /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file.path);
    const source =
      typed && !file.truncated
        ? ts.createSourceFile(
            file.path,
            file.content,
            ts.ScriptTarget.Latest,
            true,
          )
        : null;
    const py = python.get(file.path);
    const invalid =
      py?.status === "parse_error" ||
      py?.status === "unsupported_encoding" ||
      (source &&
        (
          source as ts.SourceFile & {
            parseDiagnostics: readonly ts.Diagnostic[];
          }
        ).parseDiagnostics.length > 0);
    const imports: ImportEvidence[] = [];
    if (source && !invalid) {
      const walk = (node: ts.Node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          imports.push(
            resolveImport(file.path, node.moduleSpecifier.text, known),
          );
        if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression &&
          ts.isStringLiteral(node.moduleReference.expression)
        )
          imports.push(
            resolveImport(
              file.path,
              node.moduleReference.expression.text,
              known,
            ),
          );
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        ) {
          const arg = node.arguments[0];
          imports.push(
            arg && ts.isStringLiteral(arg)
              ? resolveImport(file.path, arg.text, known)
              : {
                  specifier: "<computed import>",
                  kind: "dynamic",
                  resolved_path: null,
                },
          );
        }
        ts.forEachChild(node, walk);
      };
      walk(source);
    }
    if (py?.status === "ok")
      imports.push(
        ...py.imports.map((i) =>
          i.dynamic
            ? {
                specifier: i.specifier,
                kind: "dynamic" as const,
                resolved_path: null,
              }
            : resolvePythonImport(file.path, i.specifier, known),
        ),
      );
    const uniqueImports = [
      ...new Map(imports.map((i) => [JSON.stringify(i), i])).values(),
    ];
    index.files.push({
      path: file.path,
      sha256: hash,
      coverage: file.truncated ? "prefix" : "complete",
      parser: invalid
        ? "parse_error"
        : source
          ? "typescript"
          : py?.status === "ok"
            ? "python"
            : "file",
      imports: uniqueImports,
    });
    if (file.truncated || invalid) {
      index.skipped.push({
        path: file.path,
        reason: file.truncated
          ? "incomplete_file"
          : py?.status === "unsupported_encoding"
            ? "unsupported_python_encoding"
            : "parse_error",
      });
      continue;
    }
    if (py?.status === "unavailable")
      index.skipped.push({
        path: file.path,
        reason: "python_parser_unavailable",
      });
    const add = (
      symbol: string,
      start: number,
      end: number,
      kind: SourceTarget["kind"],
    ) => {
      const content = file.content.slice(start, end);
      const lineSeparator = /\r\n|\r|\n/;
      const startLine = file.content
        .slice(0, start)
        .split(lineSeparator).length;
      const endLine = startLine + content.split(lineSeparator).length - 1;
      const id = digest(JSON.stringify([file.path, symbol, kind])).slice(0, 16);
      const reference = {
        id: digest(JSON.stringify([file.path, hash, start, end])).slice(0, 24),
        path: file.path,
        start_line: startLine,
        end_line: endLine,
        sha256: hash,
        kind,
        content,
      };
      index.references.push(reference);
      if (!isCodePath(file.path) || isTestPath(file.path)) return;
      const target: SourceTarget = {
        id,
        path: file.path,
        symbol,
        kind,
        reference_id: reference.id,
        imports: uniqueImports,
        supporting_paths: [],
        unresolved: [],
        test_paths: [],
        notice_paths: [],
      };
      index.targets.push(target);
      return target;
    };
    // Complete file references retain context, manifests, tests and notices even
    // when declaration-level analysis is unavailable for this language.
    add("<module>", 0, file.content.length, "file");
    if (py?.status === "ok") {
      const body = Buffer.from(file.content);
      for (const declaration of py.declarations) {
        const start = body
          .subarray(0, declaration.start_byte)
          .toString("utf8").length;
        const end = body
          .subarray(0, declaration.end_byte)
          .toString("utf8").length;
        const target = add(declaration.symbol, start, end, "declaration");
        if (target && declaration.context)
          target.unresolved.push(
            `Enclosing Python class context required: ${declaration.context}`,
          );
      }
    }
    if (source) {
      for (const node of source.statements) {
        const exported =
          ts.canHaveModifiers(node) &&
          ts
            .getModifiers(node)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported) continue;
        if (
          ts
            .getModifiers(node)
            ?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
        )
          continue;
        if (
          (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
          node.name &&
          (ts.isClassDeclaration(node) || node.body)
        )
          add(node.name.text, node.getStart(source), node.end, "declaration");
        if (ts.isVariableStatement(node))
          for (const declaration of node.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.initializer)
              add(
                declaration.name.text,
                node.getStart(source),
                node.end,
                "declaration",
              );
          }
      }
    }
  }
  for (const target of index.targets) {
    const seen = new Set([target.path]);
    const unresolved = new Set<string>(target.unresolved);
    const follow = (file: string) => {
      const record = index.files.find((f) => f.path === file);
      if (
        !record ||
        record.coverage !== "complete" ||
        !["typescript", "python"].includes(record.parser)
      ) {
        unresolved.add(`Imports not statically inspected: ${file}`);
        return;
      }
      for (const imported of record.imports) {
        if (imported.kind === "unresolved" || imported.kind === "dynamic")
          unresolved.add(`${file}: ${imported.specifier}`);
        if (imported.resolved_path && !seen.has(imported.resolved_path)) {
          seen.add(imported.resolved_path);
          follow(imported.resolved_path);
        }
      }
    };
    follow(target.path);
    target.supporting_paths = [...seen].filter((f) => f !== target.path).sort();
    target.unresolved = [...unresolved].sort();
    // Association is observed import linkage, not a guessed filename or coverage claim.
    target.test_paths = index.files
      .filter(
        (f) =>
          isTestPath(f.path) &&
          f.imports.some((i) => i.resolved_path === target.path),
      )
      .map((f) => f.path);
    const relevant = [target.path, ...target.supporting_paths];
    target.notice_paths = knownPaths
      .filter(
        (notice) =>
          isNoticePath(notice) &&
          relevant.some(
            (file) =>
              path.posix.dirname(notice) === "." ||
              file.startsWith(path.posix.dirname(notice) + "/"),
          ),
      )
      .sort();
  }
  // Prefer a declaration over its whole-module fallback, but retain the module
  // when the language/parser exposes no exported implementation.
  index.targets = index.targets.filter(
    (t) =>
      t.kind !== "file" ||
      !index.targets.some((d) => d.path === t.path && d.kind === "declaration"),
  );
  return index;
}

/** Choose complete evidence blocks, never character prefixes of declarations. */
export function evidencePacket(
  index: SourceIndex,
  characterLimit = INDEX_LIMITS.promptCharacters,
): EvidencePacket {
  const packet: EvidencePacket = {
    format: INDEX_VERSION,
    targets: [],
    references: [],
    omitted_targets: index.targets.length,
  };
  const selected = new Map<string, SourceReference>();
  // Include the envelope, commas and worst-case omission count in the wire
  // allowance, rather than counting source blocks alone.
  let used = JSON.stringify(packet).length;
  if (!Number.isInteger(characterLimit) || characterLimit < used)
    throw new Error("Evidence allowance cannot contain the packet envelope.");
  const add = (reference: SourceReference | undefined) => {
    if (!reference) return false;
    if (selected.has(reference.id)) return true;
    const cost = JSON.stringify(reference).length + (selected.size ? 1 : 0);
    if (used + cost > characterLimit) return false;
    selected.set(reference.id, reference);
    used += cost;
    return true;
  };
  const targets = [...index.targets].sort(
    (a, b) =>
      a.unresolved.length - b.unresolved.length ||
      a.supporting_paths.length - b.supporting_paths.length ||
      a.path.localeCompare(b.path) ||
      a.symbol.localeCompare(b.symbol),
  );
  for (const target of targets) {
    if (packet.targets.length >= INDEX_LIMITS.candidates) break;
    const reference = index.references.find(
      (r) => r.id === target.reference_id,
    );
    if (!reference) continue;
    const targetCost =
      JSON.stringify(target).length + (packet.targets.length ? 1 : 0);
    if (
      used +
        targetCost +
        (selected.has(target.reference_id)
          ? 0
          : JSON.stringify(reference).length + (selected.size ? 1 : 0)) >
      characterLimit
    )
      continue;
    if (!add(reference)) continue;
    used += targetCost;
    packet.targets.push(target);
    for (const file of [
      ...new Set([
        target.path,
        ...target.supporting_paths,
        ...target.test_paths,
        ...target.notice_paths,
      ]),
    ])
      add(index.references.find((r) => r.path === file && r.kind === "file"));
  }
  for (const file of index.files)
    if (isManifestPath(file.path))
      add(
        index.references.find((r) => r.path === file.path && r.kind === "file"),
      );
  packet.references = [...selected.values()];
  packet.omitted_targets = index.targets.length - packet.targets.length;
  return packet;
}

/** Persist facts and source locators, never duplicate repository source in SQLite. */
export function indexRecord(index: SourceIndex, packet: EvidencePacket) {
  return {
    format: index.format,
    limits: INDEX_LIMITS,
    files: index.files,
    skipped: index.skipped,
    inspection: index.inspection ?? null,
    targets_indexed: index.targets.length,
    targets_supplied: packet.targets.length,
    omitted_targets: packet.omitted_targets,
    references: packet.references.map(
      ({ content: _content, ...reference }) => reference,
    ),
  };
}
