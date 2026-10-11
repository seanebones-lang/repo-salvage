import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { demoEnvironment, demoPort } from "./demo-config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const build = args[0] === "--build";
if (build) args.shift();
if (args.includes("--help")) {
  console.log(
    "npm run demo -- [--port 3187]\nLocal worked examples; no account or analysis key.",
  );
  process.exit(0);
}
if (Number(process.versions.node.split(".")[0]) < 22)
  throw Error("Use Node.js 22 or later; Node.js 22 is tested in CI.");
if (args.length && (args.length !== 2 || args[0] !== "--port"))
  throw Error("Usage: npm run demo -- [--port 3187]");
const port = demoPort(args[1]);
if (!build) await fs.access(path.join(root, ".next/BUILD_ID"));
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "repo-salvage-demo-"),
);
const env = demoEnvironment(
  process.env,
  directory,
  randomBytes(32).toString("hex"),
  port,
);
let child;
let stopping = false;
const stop = (signal) => {
  if (!stopping) {
    stopping = true;
    child?.kill(signal);
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const run = (commandArgs) =>
    new Promise((resolve, reject) => {
      child = spawn(process.execPath, commandArgs, {
        cwd: root,
        env,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (status) => resolve(status ?? (stopping ? 0 : 1)));
    });
  let code = 0;
  if (build) {
    if (!process.env.npm_execpath)
      throw Error("Use npm run demo to build the demo.");
    console.log(
      "Building the local demo with sign-in and paid analysis disabled…",
    );
    code = await run([process.env.npm_execpath, "run", "build"]);
  }
  if (code === 0 && !stopping) {
    const standalone = path.join(root, ".next/standalone");
    await fs.access(path.join(standalone, "server.js"));
    await fs.cp(path.join(root, "public"), path.join(standalone, "public"), {
      recursive: true,
    });
    await fs.cp(
      path.join(root, ".next/static"),
      path.join(standalone, ".next/static"),
      { recursive: true },
    );
    console.log(`Repo Salvage local demo: http://127.0.0.1:${port}/examples
Worked examples are separate from the empty catalog.
Sign-in and paid analysis are disabled. Existing credentials and databases are not used.
Press Ctrl+C to stop; this demo's temporary database will be removed.`);
    if (!stopping) code = await run([path.join(standalone, "server.js")]);
  }
  process.exitCode = code;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  await fs.rm(directory, { recursive: true, force: true });
}
