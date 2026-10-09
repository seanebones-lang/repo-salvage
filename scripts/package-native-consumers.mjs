/** Reproducible standalone example archives; no runtime credentials or target execution. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, ".."),
  directory = path.join(root, "examples/rust-go-consumers"),
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "salvage-native-package-"));
try {
  const cases = JSON.parse(
    await fs.readFile(path.join(directory, "cases.json"), "utf8"),
  );
  for (const c of cases) {
    const files =
      c.id === "rust"
        ? ["consumer.rs", "acceptance.rs", "LICENSE", "README.md"]
        : [
            "consumer.go",
            "acceptance_test.go",
            "go.mod",
            "LICENSE",
            "README.md",
          ];
    const dest = path.join(temp, c.id);
    await fs.mkdir(dest);
    const hashes = [];
    for (const name of files) {
      const bytes = await fs.readFile(path.join(directory, c.id, name));
      await fs.writeFile(path.join(dest, name), bytes);
      hashes.push({
        path: name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    const evidence = JSON.parse(
      await fs.readFile(path.join(directory, c.id, "evidence.json"), "utf8"),
    );
    await fs.writeFile(
      path.join(dest, "manifest.json"),
      JSON.stringify(
        {
          format: "repo-salvage/adapted-consumer-bundle-v1",
          source: evidence.source,
          focus: evidence.focus,
          license: "MIT",
          validation:
            "Two frozen adapted contracts, implementing-agent source review and standalone acceptance. No upstream certification or catalog writes.",
          files: hashes,
        },
        null,
        2,
      ) + "\n",
    );
    const entries = [...files, "manifest.json"].sort();
    const chunks = [];
    for (const name of entries) {
      const content = await fs.readFile(path.join(dest, name)),
        header = Buffer.alloc(512);
      const octal = (value, offset, length) =>
        header.write(
          value.toString(8).padStart(length - 1, "0") + "\0",
          offset,
          length,
          "ascii",
        );
      header.write(name, 0, 100, "utf8");
      octal(0o644, 100, 8);
      octal(0, 108, 8);
      octal(0, 116, 8);
      octal(content.length, 124, 12);
      octal(0, 136, 12);
      header.fill(32, 148, 156);
      header.write("0", 156);
      header.write("ustar\0", 257);
      header.write("00", 263);
      header.write(
        header
          .reduce((sum, b) => sum + b, 0)
          .toString(8)
          .padStart(6, "0") + "\0 ",
        148,
        8,
        "ascii",
      );
      chunks.push(
        header,
        content,
        Buffer.alloc((512 - (content.length % 512)) % 512),
      );
    }
    chunks.push(Buffer.alloc(1024));
    const archive = gzipSync(Buffer.concat(chunks));
    archive[9] = 3;
    await fs.writeFile(
      path.join(
        root,
        "public",
        c.id === "rust"
          ? "rust-edit-distance.tar.gz"
          : "go-rendezvous-consumer.tar.gz",
      ),
      archive,
    );
  }
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
