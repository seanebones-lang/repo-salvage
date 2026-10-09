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

        def declaration(node, symbol, context=None):
            start_line = min([node.lineno] + [d.lineno for d in node.decorator_list])
            if node.decorator_list:
                # Parenthesized decorators can put the expression on a later
                # line than '@'. Include the complete decorator statement.
                lines = re.split(r"\r\n|\r|\n", source)
                for line in range(start_line - 1, -1, -1):
                    prefix = lines[line][:node.col_offset]
                    if len(prefix.encode("utf-8")) == node.col_offset and lines[line][node.col_offset:].startswith("@"):
                        start_line = line + 1
                        break
            result["declarations"].append({
                "symbol": symbol,
                "start_byte": offsets[start_line - 1] + node.col_offset,
                "end_byte": offsets[node.end_lineno - 1] + node.end_col_offset,
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
    except (SyntaxError, ValueError, RecursionError):
        result["status"] = "parse_error"
        result["declarations"] = []
        result["imports"] = []
    return result


payload = json.loads(sys.stdin.buffer.read(16_100_001))
if not isinstance(payload, list) or len(payload) > 64:
    raise SystemExit(1)
if any(len(i["content"].encode("utf-8")) > 128_000 for i in payload):
    raise SystemExit(1)
if sum(len(i["content"].encode("utf-8")) for i in payload) > 2_000_000:
    raise SystemExit(1)
print(json.dumps({"format": FORMAT, "files": [inspect(i) for i in payload]}, ensure_ascii=True))
