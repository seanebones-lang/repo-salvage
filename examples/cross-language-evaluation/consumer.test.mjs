/** Hidden from the native proposal; adapted contract, not upstream certification. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classes } from "./consumer.mjs";
test("nested inputs preserve traversal order, Unicode and duplicates", () => {
  assert.equal(
    classes("base", ["two", [false, "☃", 0, 4]], { on: true, off: 0 }, "base"),
    "base two ☃ 4 on base",
  );
});
test("falsey values and unsupported types produce no tokens", () => {
  assert.equal(
    classes(
      null,
      undefined,
      false,
      true,
      0,
      NaN,
      "",
      () => {},
      Symbol("x"),
      [],
    ),
    "",
  );
  assert.equal(classes(-3, Infinity), "\u002d3 Infinity");
});
test("object entries include only enumerable own truthy string keys", () => {
  const value = Object.create({ inherited: true });
  value.own = true;
  value.no = false;
  Object.defineProperty(value, "hidden", { value: true, enumerable: false });
  value[Symbol("symbol")] = true;
  assert.equal(classes(value), "own");
  assert.equal(
    classes(Object.assign(Object.create(null), { alpha: 1, beta: 0 })),
    "alpha",
  );
});
test("raw tokens remain unescaped and undeduplicated by contract", () => {
  assert.equal(
    classes("x", "x", '\"<>&', "white space"),
    'x x \"<>& white space',
  );
});
test("empty nested arrays and maps avoid surplus separators", () => {
  assert.equal(classes([], {}, [[], { no: false }], "end", [[[]]]), "end");
  assert.equal(classes(), "");
});
// Independent test oracle accumulates tokens before joining instead of reproducing
// source recursion/string-building implementation. Generated objects use own data.
function reference(values) {
  const tokens = [],
    pending = [...values].reverse();
  while (pending.length) {
    const v = pending.pop();
    if (!v) continue;
    if (typeof v === "string" || typeof v === "number") tokens.push(String(v));
    else if (Array.isArray(v)) pending.push(...[...v].reverse());
    else if (typeof v === "object")
      for (const key of Object.keys(v)) if (v[key]) tokens.push(key);
  }
  return tokens.join(" ");
}
let seed = 0x735ac;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}
function value(depth) {
  const options = ["", false, null, 0, "token", -7, "é", NaN, undefined];
  if (depth > 0) {
    options.push([value(depth - 1), value(depth - 1)]);
    const obj = Object.create({ inherited: 1 });
    obj["k" + (random() % 4)] = random() % 2;
    obj["q" + (random() % 4)] = random() % 2;
    options.push(obj);
  }
  return options[random() % options.length];
}
test("one thousand deterministic mixed inputs match the independent oracle", () => {
  for (let i = 0; i < 1000; i++) {
    const inputs = [value(3), value(3), value(2)];
    assert.equal(classes(...inputs), reference(inputs));
  }
});
