/** Execute only these three explicitly reviewed, pinned code slices, never an upstream app. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const corpus = JSON.parse(
  await fs.readFile(
    new URL(
      "../examples/analysis-evaluation/holdout/corpus.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
function reviewedSource(repo, file, expectedBlob) {
  const source = corpus.repositories
    .find((r) => r.repo === repo)
    ?.files.find((f) => f.path === file);
  assert.ok(source);
  const body = Buffer.from(source.content);
  const blob = createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
  assert.equal(
    blob,
    expectedBlob,
    "A new source version requires an explicit consumer code review.",
  );
  return source.content;
}
const emotion = reviewedSource(
  "seanebones-lang/AI-Voiceover",
  "apps/web/lib/tts/emotion-prosody.ts",
  "1bfbbddf4244a48dd072156aa7cf80e2a2ba6688",
);
const csrf = reviewedSource(
  "seanebones-lang/AI-Voiceover",
  "apps/web/lib/security/csrf.ts",
  "1bd349000cc981d3187dbe43a53243daebf11727",
);
const verifier = reviewedSource(
  "seanebones-lang/Humanity-Grid",
  "proofs/EXP-001-v1/tools/verify.py",
  "cfc5c8697ca6b6bf61a9119b5ce2d6636c28b45d",
);
async function moduleFrom(source) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
}
function declaration(source, name) {
  const file = ts.createSourceFile(
    "part.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const node = file.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === name,
  );
  assert.ok(node);
  return node.getText(file);
}
const base = {
  speed: 1,
  pitch: 0,
  volume: 0.7,
  reverb: 0,
  echo: 0,
  noise_reduction: false,
  special_effect: "none",
};
test("prosody needs its same-file helpers; the reviewed complete module transfers", async () => {
  const isolated = await moduleFrom(
    declaration(emotion, "applyEmotionProsody"),
  );
  assert.throws(
    () => isolated.applyEmotionProsody(base, "happy"),
    ReferenceError,
  );
  const { applyEmotionProsody } = await moduleFrom(emotion);
  const result = applyEmotionProsody(base, "HAPPY");
  assert.equal(result.speed, 1.07);
  assert.equal(result.pitch, 3);
  assert.equal(base.pitch, 0);
  const outOfRange = { ...base, speed: 99 };
  assert.equal(applyEmotionProsody(outOfRange, "unknown").speed, 99);
  assert.equal(applyEmotionProsody(outOfRange, "happy").speed, 2);
});
test("expressive adjustments retain the observed bypass and clone scaling behavior", async () => {
  const { applyExpressiveCopyProsody } = await moduleFrom(emotion);
  const outOfRange = { ...base, speed: 99 };
  assert.equal(applyExpressiveCopyProsody(outOfRange, "WOW!!!", {}).speed, 99);
  const normal = applyExpressiveCopyProsody(base, "WOW!!!", {
    enabled: true,
    intensity: "dramatic",
  });
  const cloned = applyExpressiveCopyProsody(base, "WOW!!!", {
    enabled: true,
    intensity: "dramatic",
    isClonedVoice: true,
  });
  assert.ok(cloned.pitch > 0 && cloned.pitch < normal.pitch);
  assert.deepEqual(base, {
    speed: 1,
    pitch: 0,
    volume: 0.7,
    reverb: 0,
    echo: 0,
    noise_reduction: false,
    special_effect: "none",
  });
});
test("CSRF extraction transfers with its constant and does not validate a token", async () => {
  const { extractCSRFTokenFromRequest: extract } = await moduleFrom(
    "const CSRF_TOKEN_HEADER = 'X-CSRF-Token';\n" +
      declaration(csrf, "extractCSRFTokenFromRequest"),
  );
  assert.equal(
    extract(new Headers({ "X-CSRF-Token": "header" }), {
      "X-CSRF-Token": "body",
    }),
    "header",
  );
  assert.equal(
    extract(new Headers(), { "X-CSRF-Token": "unvalidated" }),
    "unvalidated",
  );
  assert.equal(extract(new Headers(), { "X-CSRF-Token": 7 }), null);
  assert.equal(extract(new Headers()), null);
});
test("reviewed Python hash declaration works outside the proof verifier, across chunk boundaries", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "salvage-reviewed-consumer-"),
  );
  try {
    const body = Buffer.alloc(1024 * 1024 + 73, 0x61);
    await fs.writeFile(path.join(directory, "large.bin"), body);
    await fs.writeFile(path.join(directory, "empty.bin"), "");
    const script = `import ast, hashlib, json, sys\nfrom pathlib import Path\nsource = ast.parse(sys.stdin.read())\nnode = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'sha256')\nassert not node.decorator_list\nmodule = ast.Module(body=[node], type_ignores=[])\nexec(compile(module, '<reviewed-sha256>', 'exec'), globals())\nprint(json.dumps([sha256(Path('large.bin')), sha256(Path('empty.bin'))]))\n`;
    const result = spawnSync("python3", ["-I", "-c", script], {
      cwd: directory,
      input: verifier,
      encoding: "utf8",
      timeout: 5000,
      env: Object.fromEntries(
        ["PATH", "SYSTEMROOT"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]]),
      ),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      createHash("sha256").update(body).digest("hex"),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
