import { createHash } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import { parsePythonFiles, type PythonSupportCandidate } from "./python-parser";
import {
  fairPathOrder,
  sourceRole,
  selectionPath,
  bindingObserver,
} from "./source-selection";

export const INDEX_VERSION = "repo-salvage/source-index-v2";
export const INDEX_LIMITS = {
  files: 64,
  initialFiles: 48,
  initialMetadataFiles: 12,
  initialLibraryFiles: 24,
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
  kind: "declaration" | "file" | "statement";
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
  support_graph?: {
    reference_id: string;
    candidates: SupportCandidate[];
    gaps: { symbol: string; reason: string }[];
    observations_omitted: number;
  }[];
  inspection?: {
    initial_paths: string[];
    followup_paths: string[];
    fill_paths: string[];
    deadline_reached: boolean;
  };
};
type SupportCandidate = {
  symbol: string;
  reference_id: string;
  relation: PythonSupportCandidate["relation"];
  fallback_members?: SupportCandidate[];
  fallback_members_omitted?: number;
};
export type ScopedContext = {
  target_id: string;
  observation: "python-ast-name-loads-v1";
  references: {
    symbol: string;
    reference_id: string;
    relation: SupportCandidate["relation"];
  }[];
  gaps: { symbol: string; reason: string }[];
  observations_omitted: number;
};
export type EvidencePacket = {
  format: typeof INDEX_VERSION;
  targets: SourceTarget[];
  references: SourceReference[];
  omitted_targets: number;
  selection_policy?:
    | "repo-salvage/coverage-v1"
    | "repo-salvage/coverage-v2"
    | "repo-salvage/coverage-v3"
    | "repo-salvage/coverage-v4";
  contexts?: { target_id: string; same_file_reference: string | null }[];
  scoped_contexts?: ScopedContext[];
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
    const referenceFor = (
      start: number,
      end: number,
      kind: SourceReference["kind"],
      deduplicate = false,
    ) => {
      const content = file.content.slice(start, end);
      const lineSeparator = /\r\n|\r|\n/;
      const startLine = file.content
        .slice(0, start)
        .split(lineSeparator).length;
      const endLine = startLine + content.split(lineSeparator).length - 1;
      const reference = {
        id: digest(JSON.stringify([file.path, hash, start, end])).slice(0, 24),
        path: file.path,
        start_line: startLine,
        end_line: endLine,
        sha256: hash,
        kind,
        content,
      };
      if (deduplicate) {
        const existing = index.references.find(
          (r) => r.id === reference.id && r.kind === kind,
        );
        if (existing) return existing;
        // A single statement can occupy the entire file. Reuse its complete-file
        // locator rather than shadowing a legacy reference with a new kind.
        const sameSpan = index.references.find((r) => r.id === reference.id);
        if (sameSpan) return sameSpan;
      }
      index.references.push(reference);
      return reference;
    };
    const add = (
      symbol: string,
      start: number,
      end: number,
      kind: SourceTarget["kind"],
    ) => {
      const reference = referenceFor(start, end, kind);
      const id = digest(JSON.stringify([file.path, symbol, kind])).slice(0, 16);
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
      const supportReference = (node: {
        start_byte: number;
        end_byte: number;
        kind: "declaration" | "statement";
      }) => {
        if (
          !Number.isSafeInteger(node.start_byte) ||
          !Number.isSafeInteger(node.end_byte) ||
          node.start_byte < 0 ||
          node.end_byte > body.length ||
          node.start_byte >= node.end_byte
        )
          throw new Error("Invalid Python support source range.");
        return referenceFor(
          body.subarray(0, node.start_byte).toString("utf8").length,
          body.subarray(0, node.end_byte).toString("utf8").length,
          node.kind,
          true,
        );
      };
      const candidate = (node: PythonSupportCandidate): SupportCandidate => ({
        symbol: node.symbol,
        reference_id: supportReference(node).id,
        relation: node.relation,
        ...(node.fallback_members
          ? {
              fallback_members: node.fallback_members.map(candidate),
              fallback_members_omitted: node.fallback_members_omitted ?? 0,
            }
          : {}),
      });
      for (const node of py.support_graph ?? []) {
        (index.support_graph ??= []).push({
          reference_id: supportReference(node).id,
          candidates: node.candidates.map(candidate),
          gaps: node.gaps,
          observations_omitted: node.observations_omitted,
        });
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

/** Select diverse complete declarations first, then explicit bounded context. */
export function evidencePacket(
  index: SourceIndex,
  characterLimit = INDEX_LIMITS.promptCharacters,
  policy: NonNullable<
    EvidencePacket["selection_policy"]
  > = "repo-salvage/coverage-v4",
): EvidencePacket {
  const packet: EvidencePacket = {
    format: INDEX_VERSION,
    targets: [],
    references: [],
    omitted_targets: index.targets.length,
    selection_policy: policy,
    contexts: [],
    ...(policy === "repo-salvage/coverage-v4" ? { scoped_contexts: [] } : {}),
  };
  if (
    !Number.isInteger(characterLimit) ||
    JSON.stringify(packet).length > characterLimit
  )
    throw new Error("Evidence allowance cannot contain the packet envelope.");
  const references = new Map(index.references.map((r) => [r.id, r]));
  const files = new Map(
    index.references.filter((r) => r.kind === "file").map((r) => [r.path, r]),
  );
  const fits = (limit = characterLimit) =>
    JSON.stringify(packet).length <= limit;
  const add = (reference: SourceReference | undefined) => {
    if (!reference) return false;
    if (packet.references.some((r) => r.id === reference.id)) return true;
    packet.references.push(reference);
    if (fits()) return true;
    packet.references.pop();
    return false;
  };
  // One target per file per turn. Coupling and block size sort within a file,
  // rather than globally disqualifying entire languages or later directories.
  const groups = new Map<string, SourceTarget[]>();
  const observers = new Map<string, ReturnType<typeof bindingObserver>>();
  const bindings = new Map<string, string[]>();
  const observed = (target: SourceTarget) => {
    if (!bindings.has(target.id)) {
      const file = files.get(target.path);
      if (
        file &&
        index.files.find((f) => f.path === target.path)?.parser === "typescript"
      ) {
        if (!observers.has(target.path))
          observers.set(target.path, bindingObserver(file.content));
        bindings.set(
          target.id,
          observers.get(target.path)!(
            references.get(target.reference_id)?.content ?? "",
            target.symbol,
          ),
        );
      } else bindings.set(target.id, []);
    }
    return bindings.get(target.id)!;
  };
  const implementationRank = (target: SourceTarget) => {
    if (target.kind === "file") return 2;
    const content = references.get(target.reference_id)?.content ?? "";
    if (
      /^(?:async\s+)?def\b/.test(content) &&
      !/\b(?:return|yield)\b/.test(content)
    )
      return 1;
    return /^(?:export\s+(?:default\s+)?|async\s+)*(?:function|class|def)\b/.test(
      content,
    ) || /=>/.test(content)
      ? 0
      : 1;
  };
  for (const target of index.targets) {
    const group = groups.get(target.path) ?? [];
    group.push(target);
    groups.set(target.path, group);
  }
  for (const group of groups.values())
    group.sort(
      (a, b) =>
        // Python exposes private helpers and enclosed methods to inspection too.
        // Give public top-level declarations a turn before those smaller blocks;
        // this naming hint neither proves an API nor removes any target.
        (policy !== "repo-salvage/coverage-v1" &&
        index.files.find((f) => f.path === a.path)?.parser === "python"
          ? Number(a.symbol.startsWith("_") || a.symbol.includes(".")) -
            Number(b.symbol.startsWith("_") || b.symbol.includes("."))
          : 0) ||
        implementationRank(a) - implementationRank(b) ||
        a.unresolved.length - b.unresolved.length ||
        a.supporting_paths.length - b.supporting_paths.length ||
        observed(a).length - observed(b).length ||
        (references.get(a.reference_id)?.content.length ?? 0) -
          (references.get(b.reference_id)?.content.length ?? 0) ||
        (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0),
    );
  const orderFiles = (paths: string[]) =>
    fairPathOrder(
      paths,
      (file) => (sourceRole(file) === "library" ? selectionPath(file) : file),
      (a, b) =>
        (references.get(groups.get(a)![0].reference_id)?.content.length ?? 0) -
          (references.get(groups.get(b)![0].reference_id)?.content.length ??
            0) || (a < b ? -1 : a > b ? 1 : 0),
    );
  const paths = [...groups.keys()];
  const orderedFiles = [
    ...orderFiles(paths.filter((p) => sourceRole(p) === "library")),
    ...orderFiles(paths.filter((p) => sourceRole(p) === "module")),
    ...orderFiles(paths.filter((p) => sourceRole(p) === "application")),
  ];
  const primaryLimit = Math.floor(characterLimit * 0.7);
  for (
    let turn = 0;
    turn < Math.max(0, ...[...groups.values()].map((g) => g.length));
    turn++
  ) {
    for (const file of orderedFiles) {
      if (packet.targets.length >= INDEX_LIMITS.candidates) break;
      const target = groups.get(file)![turn];
      if (!target) continue;
      const reference = references.get(target.reference_id);
      if (!reference) continue;
      const oldReferences = packet.references.length;
      if (!add(reference)) continue;
      packet.targets.push(target);
      packet.contexts!.push({
        target_id: target.id,
        same_file_reference: target.kind === "file" ? reference.id : null,
      });
      packet.omitted_targets--;
      // Keep room for context unless a single complete block needs the larger allowance.
      if (!fits(packet.targets.length === 1 ? characterLimit : primaryLimit)) {
        packet.targets.pop();
        packet.contexts!.pop();
        packet.omitted_targets++;
        packet.references.splice(oldReferences);
      }
    }
    if (packet.targets.length >= INDEX_LIMITS.candidates) break;
  }
  const selectedPaths = [...new Set(packet.targets.map((t) => t.path))];
  // Notices precede module bodies; never infer licensing from absent notices.
  for (const notice of [
    ...new Set(packet.targets.flatMap((t) => t.notice_paths)),
  ].sort())
    add(files.get(notice));
  const privatePythonPaths = new Set(
    selectedPaths.filter((file) => {
      const declarations = packet.targets.filter(
        (t) => t.path === file && t.kind === "declaration",
      );
      return (
        index.files.find((f) => f.path === file)?.parser === "python" &&
        declarations.length > 0 &&
        declarations.every(
          (t) => t.symbol.startsWith("_") || t.symbol.includes("."),
        )
      );
    }),
  );
  const contextPaths = selectedPaths.sort(
    (a, b) =>
      // Defer private-only Python declaration context; other languages and file
      // targets keep their turns. File size breaks ties; no bodies are cut.
      (["repo-salvage/coverage-v3", "repo-salvage/coverage-v4"].includes(policy)
        ? Number(privatePythonPaths.has(a)) - Number(privatePythonPaths.has(b))
        : 0) ||
      (files.get(a)?.content.length ?? Infinity) -
        (files.get(b)?.content.length ?? Infinity) ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
  for (const file of contextPaths) {
    const reference = files.get(file);
    if (!reference) continue;
    const oldReferences = packet.references.length;
    if (!add(reference)) continue;
    const contexts = packet.contexts!.filter(
      (c) => packet.targets.find((t) => t.id === c.target_id)?.path === file,
    );
    contexts.forEach((c) => {
      c.same_file_reference = reference.id;
    });
    if (!fits()) {
      contexts.forEach((c) => {
        c.same_file_reference = null;
      });
      packet.references.splice(oldReferences);
    }
  }
  if (policy === "repo-salvage/coverage-v4") {
    const graph = new Map(index.support_graph?.map((g) => [g.reference_id, g]));
    const primaryReferences = new Set(
      packet.targets.map((t) => t.reference_id),
    );
    const work: {
      context: ScopedContext;
      queue: SupportCandidate[];
      visited: Set<string>;
    }[] = [];
    const supportFits = () =>
      JSON.stringify(packet).length <= characterLimit - 128;
    for (const target of packet.targets) {
      if (
        packet.contexts!.find((c) => c.target_id === target.id)
          ?.same_file_reference ||
        !graph.has(target.reference_id)
      )
        continue;
      const context: ScopedContext = {
        target_id: target.id,
        observation: "python-ast-name-loads-v1",
        references: [],
        gaps: [],
        observations_omitted: 0,
      };
      packet.scoped_contexts!.push(context);
      if (!supportFits()) {
        packet.scoped_contexts!.pop();
        continue;
      }
      const node = graph.get(target.reference_id)!;
      context.gaps = node.gaps.slice(0, 12);
      context.observations_omitted =
        node.observations_omitted + Math.max(0, node.gaps.length - 12);
      if (!supportFits()) {
        context.observations_omitted += context.gaps.length;
        context.gaps = [];
      }
      work.push({
        context,
        queue: [...node.candidates],
        visited: new Set([target.reference_id]),
      });
    }
    // Fair turns across targets. Names and member spellings are observations,
    // never proven scope/receiver resolution. Whole nodes either fit or stay out.
    const gap = (context: ScopedContext, symbol: string, reason: string) => {
      if (context.gaps.some((g) => g.symbol === symbol && g.reason === reason))
        return;
      if (context.gaps.length >= 12) {
        context.observations_omitted++;
        return;
      }
      context.gaps.push({ symbol, reason });
      if (!supportFits()) {
        context.gaps.pop();
        context.observations_omitted++;
      }
    };
    for (let turn = 0; turn < 16; turn++) {
      for (const state of work) {
        while (
          state.queue.length &&
          state.visited.has(state.queue[0].reference_id)
        )
          state.queue.shift();
        const c = state.queue.shift();
        if (!c) continue;
        state.visited.add(c.reference_id);
        const oldLength = packet.references.length;
        const entry = {
          symbol: c.symbol,
          reference_id: c.reference_id,
          relation: c.relation,
        };
        state.context.references.push(entry);
        if (!add(references.get(c.reference_id)) || !supportFits()) {
          state.context.references.pop();
          packet.references.splice(oldLength);
          gap(state.context, c.symbol, "packet-budget");
          if (c.fallback_members) {
            state.queue.push(...c.fallback_members);
            state.context.observations_omitted +=
              c.fallback_members_omitted ?? 0;
          }
          continue;
        }
        // Another supplied primary has its own context entry. Link to it rather
        // than duplicating its transitive observation metadata for every wrapper.
        const node = primaryReferences.has(c.reference_id)
          ? undefined
          : graph.get(c.reference_id);
        if (node) {
          state.queue.push(...node.candidates);
          for (const g of node.gaps) gap(state.context, g.symbol, g.reason);
          state.context.observations_omitted += node.observations_omitted;
        }
      }
    }
    for (const state of work)
      state.context.observations_omitted += new Set(
        state.queue
          .filter((c) => !state.visited.has(c.reference_id))
          .map((c) => c.reference_id),
      ).size;
    // Counter digit growth must obey the same envelope allowance too.
    while (!fits() && packet.scoped_contexts!.length)
      packet.scoped_contexts!.pop();
  }
  for (const file of [
    ...new Set(
      packet.targets.flatMap((t) => [...t.supporting_paths, ...t.test_paths]),
    ),
  ])
    add(files.get(file));
  for (const file of index.files)
    if (isManifestPath(file.path)) add(files.get(file.path));
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
    selection_policy: packet.selection_policy ?? "legacy-v2",
    ...(packet.scoped_contexts
      ? { scoped_contexts: packet.scoped_contexts }
      : {}),
  };
}
