"""Parse data with Python 3.11 grammar. Never import, compile or execute target code."""
import ast
import io
import json
import sys
import tokenize

FORMAT = "repo-salvage/python-ast-v1"
if sys.version_info < (3, 11):
    raise SystemExit(1)
if sys.platform.startswith("linux"):
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))


def inspect(item):
    content = item["content"]
    raw = content.encode("utf-8")
    result = {"path": item["path"], "status": "ok", "declarations": [], "imports": []}
    try:
        encoding, _ = tokenize.detect_encoding(io.BytesIO(raw).readline)
        if encoding not in ("utf-8", "utf-8-sig"):
            result["status"] = "unsupported_encoding"
            return result
        bom = 3 if content.startswith("\ufeff") else 0
        source = content[1:] if bom else content
        tree = ast.parse(source, feature_version=(3, 11))
        offsets = [bom]
        # Python logical lines recognize CR/LF, not every Unicode separator
        # understood by str.splitlines(). Keep byte positions in original text.
        import re
        lines_with_ends = re.findall(r"[^\r\n]*(?:\r\n|\r|\n|$)", source)
        for line in lines_with_ends:
            offsets.append(offsets[-1] + len(line.encode("utf-8")))

        def location(node):
            decorators = getattr(node, "decorator_list", [])
            start_line = min([node.lineno] + [d.lineno for d in decorators])
            if decorators:
                # Parenthesized decorators can put the expression on a later
                # line than '@'. Include the complete decorator statement.
                lines = re.split(r"\r\n|\r|\n", source)
                for line in range(start_line - 1, -1, -1):
                    prefix = lines[line][:node.col_offset]
                    if len(prefix.encode("utf-8")) == node.col_offset and lines[line][node.col_offset:].startswith("@"):
                        start_line = line + 1
                        break
            return {
                "start_byte": offsets[start_line - 1] + node.col_offset,
                "end_byte": offsets[node.end_lineno - 1] + node.end_col_offset,
            }

        def declaration(node, symbol, context=None):
            result["declarations"].append({
                "symbol": symbol,
                **location(node),
                "context": context,
            })

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                # A later module binding replaces the earlier class and all
                # of its methods, even if the replacement is a function.
                result["declarations"] = [
                    d for d in result["declarations"]
                    if d["symbol"] != node.name and d["context"] != node.name
                ]
                declaration(node, node.name)
                if isinstance(node, ast.ClassDef):
                    for method in node.body:
                        if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            declaration(method, node.name + "." + method.name, node.name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for name in node.names:
                    result["imports"].append({"specifier": name.name, "dynamic": False})
            elif isinstance(node, ast.ImportFrom):
                prefix = "." * node.level
                names = [node.module] if node.module else [n.name for n in node.names]
                for name in names:
                    result["imports"].append({"specifier": prefix + name, "dynamic": False})
            elif isinstance(node, ast.Call) and (
                isinstance(node.func, ast.Name) and node.func.id == "__import__"
                or isinstance(node.func, ast.Attribute) and node.func.attr == "import_module"
            ):
                result["imports"].append({"specifier": "<dynamic Python import>", "dynamic": True})
        # Repeated definitions shadow earlier bindings. Retain the last source
        # declaration, rather than publishing duplicate target identities.
        unique = {d["symbol"]: d for d in result["declarations"]}
        result["declarations"] = list(unique.values())
        result["support_graph"] = support_graph(tree, location)
    except (SyntaxError, ValueError, RecursionError):
        result["status"] = "parse_error"
        result["declarations"] = []
        result["imports"] = []
    return result


def support_graph(tree, location):
    """Name-load observations, not scope resolution or an extraction closure.

    Only unique unconditional module statements qualify as support. Attribute
    spelling can suggest class-member excerpts when a whole class cannot fit;
    that does not establish the receiver's type. Never synthesize class headers.
    """
    definitions = {}
    # A named expression can write outside a simple statement's target list.
    # Over-reporting a nested local write is preferable to asserting resolution.
    blocked = {n.target.id for n in ast.walk(tree) if isinstance(n, ast.NamedExpr)
               and isinstance(n.target, ast.Name)}
    nodes = []
    futures = []
    wildcard = any(isinstance(n, ast.ImportFrom) and any(a.name == "*" for a in n.names) for n in ast.walk(tree))

    def bound_names(node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            return {node.name}
        if isinstance(node, ast.Import):
            return {n.asname or n.name.split(".")[0] for n in node.names}
        if isinstance(node, ast.ImportFrom):
            return {n.asname or n.name for n in node.names if n.name != "*"}
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        return {n.id for target in targets for n in ast.walk(target)
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}

    # Skip nested function/class scopes when finding conditional module writes.
    def conditional_names(node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                             ast.Import, ast.ImportFrom)):
            return bound_names(node)
        names = set()
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            names.add(node.id)
        for child in ast.iter_child_nodes(node):
            names.update(conditional_names(child))
        return names

    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            futures.append(node)
            nodes.append((node, "<future-import>", "statement", None))
            continue
        simple = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                                  ast.Import, ast.ImportFrom, ast.Assign, ast.AnnAssign))
        if not simple:
            blocked.update(conditional_names(node))
            continue
        if isinstance(node, ast.ImportFrom) and any(n.name == "*" for n in node.names):
            wildcard = True
        kind = "declaration" if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else "statement"
        names = bound_names(node)
        for name in names:
            definitions.setdefault(name, []).append(node)
        nodes.append((node, node.name if kind == "declaration" else ",".join(sorted(names)), kind, None))
        if isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    nodes.append((member, node.name + "." + member.name, "declaration", node.name))

    def descriptor(node, symbol, relation):
        return {"symbol": symbol, **location(node), "relation": relation,
                "kind": "declaration" if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else "statement"}

    def loaded_names(node):
        names = lambda n: {x.id for x in ast.walk(n) if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Load)}
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if isinstance(node, ast.ClassDef):
                return set().union(*(loaded_names(n) for n in node.body),
                                   *(names(n) for n in [*node.bases, *node.decorator_list, *node.keywords]))
            return names(node)
        local = {a.arg for a in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]}
        local.update(a.arg for a in [node.args.vararg, node.args.kwarg] if a)
        globals_ = set()

        class Locals(ast.NodeVisitor):
            def visit_Name(self, n):
                if isinstance(n.ctx, (ast.Store, ast.Del)):
                    local.add(n.id)

            def visit_Global(self, n):
                globals_.update(n.names)

            def visit_FunctionDef(self, n):
                local.add(n.name)

            visit_AsyncFunctionDef = visit_FunctionDef
            visit_ClassDef = visit_FunctionDef

            def visit_Import(self, n):
                local.update(bound_names(n))

            visit_ImportFrom = visit_Import

            def visit_comprehension(self, n):
                # Comprehension targets have their own scope; don't classify
                # another load of the same name as a function-local binding.
                self.visit(n.iter)
                for condition in n.ifs:
                    self.visit(condition)

        visitor = Locals()
        for statement in node.body:
            visitor.visit(statement)
        body_loads = set().union(*(names(n) for n in node.body)) - (local - globals_)
        # Defaults, annotations and decorators use the enclosing scope, even
        # when a parameter has the same spelling as a module binding.
        definition_loads = names(node.args) | set().union(*(names(n) for n in node.decorator_list))
        if node.returns:
            definition_loads.update(names(node.returns))
        return body_loads | definition_loads

    graph = []
    for node, symbol, kind, enclosing in nodes:
        loads = loaded_names(node)
        attrs = {n.attr for n in ast.walk(node) if isinstance(n, ast.Attribute)}
        observed = sorted((loads & (definitions.keys() | blocked)) - {symbol})
        if enclosing and enclosing not in observed:
            observed.insert(0, enclosing)
        candidates = [descriptor(n, "<future-import>", "module-configuration") for n in futures if n is not node]
        gaps = []
        for name in observed[:24]:
            choices = definitions.get(name, [])
            if name in blocked or len(choices) != 1:
                gaps.append({"symbol": name, "reason": "ambiguous-or-conditional-binding"})
                continue
            dependency = choices[0]
            if dependency is node:
                continue
            if isinstance(dependency, ast.AnnAssign) and dependency.value is None:
                gaps.append({"symbol": name, "reason": "annotation-only-binding"})
                continue
            d = descriptor(dependency, name, "enclosing-class" if name == enclosing else "module-name")
            if isinstance(dependency, ast.ClassDef):
                members = [m for m in dependency.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))
                           and (m.name == "__init__" or m.name in attrs)]
                members.sort(key=lambda m: (m.name != "__init__", m.lineno))
                d["fallback_members"] = [descriptor(m, name + "." + m.name, "class-member-spelling") for m in members[:8]]
                d["fallback_members_omitted"] = max(0, len(members) - 8)
            candidates.append(d)
        if wildcard:
            gaps.append({"symbol": "*", "reason": "wildcard-import"})
        graph.append({"symbol": symbol, **location(node), "kind": kind,
                      "candidates": candidates, "gaps": gaps,
                      "observations_omitted": max(0, len(observed) - 24)})
    return graph


payload = json.loads(sys.stdin.buffer.read(16_100_001))
if not isinstance(payload, list) or len(payload) > 64:
    raise SystemExit(1)
if any(len(i["content"].encode("utf-8")) > 128_000 for i in payload):
    raise SystemExit(1)
if sum(len(i["content"].encode("utf-8")) for i in payload) > 2_000_000:
    raise SystemExit(1)
print(json.dumps({"format": FORMAT, "files": [inspect(i) for i in payload]}, ensure_ascii=True))
