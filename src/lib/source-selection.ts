import ts from "typescript";

/** Scheduling hints only; neither dependency completeness nor reuse quality. */
export function bindingObserver(
  source: string,
): (declaration: string, symbol: string) => string[] {
  const file = ts.createSourceFile(
    "context.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set<string>();
  for (const node of file.statements) {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)) &&
      node.name
    )
      names.add(node.name.text);
    if (ts.isVariableStatement(node))
      for (const d of node.declarationList.declarations)
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
    if (ts.isImportDeclaration(node) && node.importClause) {
      if (node.importClause.name) names.add(node.importClause.name.text);
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings))
        names.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings))
        for (const e of bindings.elements) names.add(e.name.text);
    }
  }
  const cache = new Map<string, string[]>();
  return (declaration, symbol) => {
    if (cache.has(declaration))
      return cache.get(declaration)!.filter((name) => name !== symbol);
    const block = ts.createSourceFile(
      "declaration.ts",
      declaration,
      ts.ScriptTarget.Latest,
      true,
    );
    const observed = new Set<string>();
    const visit = (node: ts.Node) => {
      if (
        ts.isIdentifier(node) &&
        names.has(node.text) &&
        !(
          "name" in node.parent &&
          (node.parent as ts.NamedDeclaration).name === node &&
          !ts.isShorthandPropertyAssignment(node.parent)
        ) &&
        !(
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node
        ) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      )
        observed.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(block);
    const result = [...observed].sort();
    cache.set(declaration, result);
    return result.filter((name) => name !== symbol);
  };
}

/** Deterministic turns across directory branches, then files, without scoring usefulness. */
export function sourceRole(file: string): "library" | "module" | "application" {
  // A scheduling hint only: entrypoints/configuration remain eligible. These
  // names often describe wiring, while the remaining files expose implementation.
  return /(^|\/)(?:route|page|layout|middleware|main|index|__init__|build|entrypoint)\.[^/]+$|(?:^|\/)[^/]+\.config\.[^/]+$/.test(
    file,
  )
    ? "application"
    : /(^|\/)(lib|utils?|helpers?|core|algorithms|domain)\//.test(file)
      ? "library"
      : "module";
}
/** Nested library directories share a source-area turn instead of multiplying it. */
export function selectionPath(file: string) {
  const parts = file.split("/");
  const area = parts.findIndex((p) =>
    /^(lib|utils?|helpers?|core|algorithms|domain)$/.test(p),
  );
  return area < 0
    ? file
    : [...parts.slice(0, area + 1), parts.at(-1)!].join("/");
}
export function fairPathOrder<T>(
  entries: readonly T[],
  filePath: (entry: T) => string,
  withinDirectory: (a: T, b: T) => number,
): T[] {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const visit = (items: readonly T[], depth: number): T[] => {
    const direct: T[] = [];
    const branches = new Map<string, T[]>();
    for (const item of items) {
      const parts = filePath(item).split("/");
      if (parts.length <= depth + 1) direct.push(item);
      else {
        const branch = branches.get(parts[depth]) ?? [];
        branch.push(item);
        branches.set(parts[depth], branch);
      }
    }
    const queues = [
      ...(direct.length ? [direct.sort(withinDirectory)] : []),
      ...[...branches]
        .sort(([a], [b]) => compare(a, b))
        .map(([, group]) => visit(group, depth + 1)),
    ];
    const offsets = queues.map(() => 0);
    const result: T[] = [];
    while (result.length < items.length)
      for (let i = 0; i < queues.length; i++)
        if (offsets[i] < queues[i].length) result.push(queues[i][offsets[i]++]);
    return result;
  };
  return visit(entries, 0);
}
