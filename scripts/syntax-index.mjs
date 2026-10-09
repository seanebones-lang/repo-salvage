/** Trusted CST parser. Source arrives as bounded JSON data, never an executable. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Parser, Language } from "web-tree-sitter";
const MAX_NODES = 24000,
  MAX_UNITS = 256,
  MAX_OBSERVATIONS = 24;
const manifest = JSON.parse(
  await fs.readFile(
    new URL("./grammars/manifest.json", import.meta.url),
    "utf8",
  ),
);
await Parser.init();
const languages = new Map();
for (const asset of manifest.assets) {
  const b = await fs.readFile(
    new URL(
      "./grammars/tree-sitter-" + asset.language + ".wasm",
      import.meta.url,
    ),
  );
  if (createHash("sha256").update(b).digest("hex") !== asset.sha256)
    throw Error("Grammar checksum mismatch");
  languages.set(asset.language, await Language.load(b));
}
let data = "";
for await (const b of process.stdin) {
  data += b;
  if (Buffer.byteLength(data) > 2500000) throw Error("Input limit");
}
const files = JSON.parse(data);
if (!Array.isArray(files) || files.length > 64) throw Error("File limit");
const field = (n, key) => n.childForFieldName(key);
function inspect(file) {
  const language = file.path.toLowerCase().endsWith(".go") ? "go" : "rust";
  const base = {
    path: file.path,
    language,
    status: "ok",
    declarations: [],
    imports: [],
    support_graph: [],
    limitations: [],
  };
  const parser = new Parser();
  parser.setLanguage(languages.get(language));
  let tree;
  try {
    if (
      typeof file.content !== "string" ||
      Buffer.byteLength(file.content) > 128000
    )
      throw Error("Input limit");
    const source = file.content;
    tree = parser.parse(source);
    if (!tree || tree.rootNode.hasError)
      return { ...base, status: "parse_error" };
    let visits = 0;
    const walk = (n) => {
      const result = [],
        pending = [n];
      while (pending.length) {
        const v = pending.pop();
        if (++visits > MAX_NODES * 12) throw Error("Visit limit");
        result.push(v);
        pending.push(...[...v.namedChildren].reverse());
      }
      return result;
    };
    const root = tree.rootNode;
    if (walk(root).length > MAX_NODES) throw Error("Node limit");
    const span = (n, start = n.startIndex) => {
      if (source.slice(n.startIndex, n.endIndex) !== n.text)
        throw Error("Source coordinate mismatch");
      return {
        start_index: start,
        end_index: n.endIndex,
        kind: [
          "package_clause",
          "import_declaration",
          "use_declaration",
          "extern_crate_declaration",
          "inner_attribute_item",
          "const_item",
          "static_item",
          "const_declaration",
          "var_declaration",
        ].includes(n.type)
          ? "statement"
          : "declaration",
      };
    };
    const units = [],
      bindings = new Map(),
      members = new Map(),
      configuration = [];
    const bind = (name, u) => {
      if (!name || name.length > 120) return;
      bindings.set(name, [...(bindings.get(name) ?? []), u]);
    };
    const member = (name, u) => {
      members.set(name, [...(members.get(name) ?? []), u]);
    };
    let attributes = [];
    for (const node of root.namedChildren) {
      if (node.type === "attribute_item") {
        attributes.push(node);
        continue;
      }
      if (node.type.endsWith("comment")) continue;
      const attrs = attributes;
      attributes = [];
      const u = {
        ...span(node, attrs[0]?.startIndex ?? node.startIndex),
        node,
        conditional: attrs.some((a) => /\b(?:cfg|cfg_attr)\b/.test(a.text)),
        symbol: "",
        context: null,
      };
      if (
        [
          "package_clause",
          "import_declaration",
          "use_declaration",
          "extern_crate_declaration",
          "inner_attribute_item",
        ].includes(node.type)
      ) {
        u.symbol =
          node.type === "package_clause"
            ? "<package>"
            : node.type === "inner_attribute_item"
              ? "<crate-attribute>"
              : node.text.slice(0, 110).replace(/\s+/g, " ");
        configuration.push(u);
        if (node.type === "import_declaration")
          for (const n of walk(node))
            if (
              ["interpreted_string_literal", "raw_string_literal"].includes(
                n.type,
              )
            )
              base.imports.push({
                specifier: n.text.slice(1, -1),
                dynamic: false,
              });
        if (["use_declaration", "extern_crate_declaration"].includes(node.type))
          base.imports.push({
            specifier: node.text.replace(
              /^(?:pub(?:\([^)]*\))?\s+)?(?:use|extern crate)\s+|;$/g,
              "",
            ),
            dynamic: u.conditional,
          });
        continue;
      }
      if (language === "go") {
        if (
          ["function_declaration", "method_declaration"].includes(node.type) &&
          field(node, "body")
        ) {
          const receiver = field(node, "receiver");
          const receiverType =
            receiver &&
            walk(receiver).find((n) => n.type === "type_identifier");
          const name = field(node, "name")?.text;
          u.symbol = receiver ? receiverType?.text + "." + name : name;
          u.context = receiver
            ? (receiverType?.text ?? "<unresolved-receiver>")
            : null;
          units.push(u);
          if (receiver) member(name, u);
          else bind(name, u);
        }
        if (
          ["type_declaration", "const_declaration", "var_declaration"].includes(
            node.type,
          )
        ) {
          const specs = node.namedChildren.filter((n) =>
            ["type_spec", "type_alias", "const_spec", "var_spec"].includes(
              n.type,
            ),
          );
          for (const spec of specs) {
            const names = spec.children.filter(
              (_, i) => spec.fieldNameForChild(i) === "name",
            );
            for (const name of names) {
              const v = { ...u, symbol: name.text };
              units.push(v);
              bind(name.text, v);
            }
          }
        }
      } else {
        if (
          [
            "function_item",
            "struct_item",
            "enum_item",
            "type_item",
            "const_item",
            "static_item",
            "trait_item",
            "macro_definition",
            "mod_item",
            "union_item",
          ].includes(node.type)
        ) {
          const name = field(node, "name")?.text;
          if (name) {
            u.symbol = name;
            units.push(u);
            bind(name, u);
          }
        }
        if (node.type === "impl_item") {
          const type = field(node, "type"),
            trait = field(node, "trait");
          const typeName =
            type && walk(type).find((n) => n.type === "type_identifier")?.text;
          u.symbol = (
            "impl " +
            (trait ? trait.text + " for " : "") +
            (type?.text ?? "<unknown>")
          ).slice(0, 120);
          units.push(u);
          let methodAttributes = [];
          for (const method of field(node, "body")?.namedChildren ?? []) {
            if (method.type === "attribute_item") {
              methodAttributes.push(method);
              continue;
            }
            if (method.type.endsWith("comment")) continue;
            const ma = methodAttributes;
            methodAttributes = [];
            if (method.type !== "function_item" || !field(method, "body"))
              continue;
            const name = field(method, "name")?.text;
            if (!name) continue;
            const v = {
              ...span(method, ma[0]?.startIndex ?? method.startIndex),
              node: method,
              conditional:
                u.conditional ||
                ma.some((a) => /\b(?:cfg|cfg_attr)\b/.test(a.text)),
              symbol:
                (typeName ?? "<impl>") +
                "::" +
                (trait ? trait.text + "::" : "") +
                name,
              context: u.symbol,
              enclosing: u,
            };
            units.push(v);
            member(name, { ...u, conditional: v.conditional });
          }
        }
      }
    }
    if (units.length > MAX_UNITS || configuration.length > MAX_UNITS)
      throw Error("Declaration limit");
    const symbolCounts = new Map();
    for (const u of units)
      symbolCounts.set(u.symbol, (symbolCounts.get(u.symbol) ?? 0) + 1);
    for (const u of units) {
      const nodes = walk(u.node),
        locals = new Set(),
        names = new Set(),
        memberNames = new Set();
      const collect = (n) => {
        if (n)
          for (const x of walk(n))
            if (
              ["identifier", "type_identifier", "field_identifier"].includes(
                x.type,
              )
            )
              locals.add(x.text);
      };
      for (const n of nodes) {
        if (language === "go") {
          if (
            [
              "parameter_declaration",
              "variadic_parameter_declaration",
              "var_spec",
              "const_spec",
              "type_parameter_declaration",
            ].includes(n.type)
          )
            for (let i = 0; i < n.childCount; i++)
              if (n.fieldNameForChild(i) === "name") collect(n.child(i));
          if (["short_var_declaration", "range_clause"].includes(n.type))
            collect(field(n, "left"));
        } else {
          if (
            [
              "parameter",
              "let_declaration",
              "for_expression",
              "let_condition",
            ].includes(n.type)
          )
            collect(field(n, "pattern"));
          if (n.type === "closure_parameters") collect(n);
          if (n.type === "match_pattern") collect(n);
          if (["type_parameter", "const_parameter"].includes(n.type))
            collect(field(n, "name"));
        }
      }
      // Names are spellings only; local binding suppression is conservative across
      // nested scopes. It can omit a relevant global, which is an explicit gap.
      for (const n of nodes) {
        if (["identifier", "type_identifier"].includes(n.type))
          names.add(n.text);
        if (
          n.type === "field_identifier" &&
          ["selector_expression", "field_expression"].includes(n.parent?.type)
        )
          memberNames.add(n.text);
      }
      const candidates = [],
        gaps = [],
        seen = new Set();
      let omitted = 0;
      const gap = (symbol, reason) => {
        if (
          gaps.length < 12 &&
          !gaps.some((g) => g.symbol === symbol && g.reason === reason)
        )
          gaps.push({ symbol, reason });
        else omitted++;
      };
      const add = (v, relation) => {
        const key = v.start_index + ":" + v.end_index;
        if (key === u.start_index + ":" + u.end_index || seen.has(key)) return;
        seen.add(key);
        if (candidates.length >= MAX_OBSERVATIONS) {
          omitted++;
          return;
        }
        candidates.push({
          symbol: v.symbol,
          ...span(v.node, v.start_index),
          relation,
        });
      };
      if (u.enclosing) add(u.enclosing, "enclosing-impl");
      if (u.context && language === "go") {
        const defs = bindings.get(u.context) ?? [];
        if (defs.length === 1) add(defs[0], "receiver-type");
        else gap(u.context, "ambiguous-or-conditional-binding");
      }
      for (const name of names) {
        const defs = bindings.get(name);
        if (!defs) continue;
        if (locals.has(name)) {
          gap(name, "local-binding-observed");
          continue;
        }
        if (defs.length !== 1 || defs[0].conditional) {
          gap(name, "ambiguous-or-conditional-binding");
          continue;
        }
        if (["mod_item", "macro_definition"].includes(defs[0].node.type)) {
          gap(name, "opaque-module-or-macro");
          continue;
        }
        add(defs[0], "module-name");
      }
      for (const name of memberNames) {
        const defs = members.get(name) ?? [];
        if (defs.length === 1 && !defs[0].conditional)
          add(defs[0], "member-spelling");
        else if (defs.length) gap(name, "ambiguous-or-conditional-binding");
      }
      for (const c of configuration) {
        add(c, "module-configuration");
        if (c.conditional) gap(c.symbol, "ambiguous-or-conditional-binding");
        if (
          language === "rust" &&
          /\*/.test(c.node.text) &&
          c.node.type === "use_declaration"
        )
          gap(c.symbol, "wildcard-import");
      }
      const symbol =
        symbolCounts.get(u.symbol) > 1
          ? u.symbol + "@" + u.start_index
          : u.symbol;
      if (u.conditional) gap(u.symbol, "ambiguous-or-conditional-binding");
      if (
        u.kind === "declaration" &&
        !["mod_item", "macro_definition"].includes(u.node.type)
      )
        base.declarations.push({
          symbol,
          start_index: u.start_index,
          end_index: u.end_index,
          context: u.context,
          conditional: u.conditional,
        });
      base.support_graph.push({
        ...span(u.node, u.start_index),
        candidates,
        gaps,
        observations_omitted: omitted,
      });
    }
    base.limitations =
      language === "go"
        ? [
            "Go package peers, build constraints, initialization and receiver resolution are not resolved.",
          ]
        : [
            "Rust modules, macro expansion, conditional compilation, trait resolution and initialization are not resolved.",
          ];
    return base;
  } catch {
    return {
      ...base,
      status: "unavailable",
      declarations: [],
      support_graph: [],
      imports: [],
      limitations: ["Syntax parser budget or coordinate validation failed."],
    };
  } finally {
    tree?.delete();
    parser.delete();
  }
}
const result = files.map(inspect);
process.stdout.write(
  JSON.stringify({ format: "repo-salvage/syntax-cst-v1", files: result }),
);
