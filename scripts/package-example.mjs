import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// A deterministic, standard ustar archive of a fixed allowlist; no user-controlled paths.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "parser.mjs",
  "consumer.test.mjs",
  "package.json",
  "README.md",
  "LICENSE",
];
const chunks = [];
for (const file of files) {
  const content = fs.readFileSync(
    path.join(root, "examples/summary-parser", file),
  );
  const header = Buffer.alloc(512);
  const octal = (value, offset, length) =>
    header.write(
      value.toString(8).padStart(length - 1, "0") + "\0",
      offset,
      length,
      "ascii",
    );
  header.write(`summary-parser/${file}`, 0, 100, "utf8");
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(content.length, 124, 12);
  octal(0, 136, 12);
  header.fill(32, 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  chunks.push(
    header,
    content,
    Buffer.alloc((512 - (content.length % 512)) % 512),
  );
}
chunks.push(Buffer.alloc(1024));
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(
  path.join(root, "public/summary-parser.tar.gz"),
  gzipSync(Buffer.concat(chunks)),
);
