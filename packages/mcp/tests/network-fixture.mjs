import { createHash } from "node:crypto";
export const text =
  'export const greeting = "A😀B";\nthrow new Error("This source must never execute");\n';
export const notice = "MIT fixture notice. Test data only.\n";
export const repository = "fixture/utility",
  commit = "a".repeat(40);
export const blob = (value) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith("https://raw.githubusercontent.com/")) {
    if (options?.headers?.Authorization)
      throw new Error("Credential sent to raw source");
    const content =
      url ===
      `https://raw.githubusercontent.com/${repository}/${commit}/src/unit.ts`
        ? text
        : url ===
            `https://raw.githubusercontent.com/${repository}/${commit}/LICENSE`
          ? notice
          : null;
    if (content === null) return new Response("missing", { status: 404 });
    return new Response(content);
  }
  return original(input, options);
};
