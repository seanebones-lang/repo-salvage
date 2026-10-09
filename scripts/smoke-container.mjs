/** Disposable container/volume checks. No real credentials, GitHub or model calls. */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";

if (process.argv[2] !== "--run" || process.argv.length !== 4) {
  console.log(
    "Usage: node scripts/smoke-container.mjs --run BUILT_IMAGE\nUses disposable local Docker containers and volumes; no real credentials or provider calls.",
  );
  process.exit(process.argv.length > 2 ? 1 : 0);
}
const image = process.argv[3];
const id = "salvage-smoke-" + randomUUID();
const containers = [],
  volumes = [],
  checks = [];
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const environment = {
  AUTH_SECRET: randomUUID() + randomUUID(),
  AUTH_URL: "http://127.0.0.1:3199",
  GLOBAL_DAILY_SUMMARY_LIMIT: "0",
  DAILY_SUMMARY_LIMIT: "0",
  AGENT_READ_LIMIT: "100",
};
function volume(suffix) {
  const name = id + "-" + suffix;
  docker("volume", "create", name);
  volumes.push(name);
  return name;
}
function run(
  name,
  data,
  {
    root = false,
    readonly = false,
    env = environment,
    writableImage = false,
  } = {},
) {
  containers.push(name);
  return docker(
    "run",
    "-d",
    "--name",
    name,
    "--label",
    "repo-salvage.smoke=true",
    "--memory",
    "512m",
    "--cpus",
    "0.5",
    ...(writableImage ? [] : ["--read-only"]),
    "--tmpfs",
    "/tmp:rw,nosuid,size=64m",
    "--publish",
    "127.0.0.1::3000",
    ...(root ? ["--user", "0"] : ["--cap-drop", "ALL"]),
    ...(data
      ? [
          "--mount",
          `type=volume,source=${data},target=/app/data,volume-nocopy${readonly ? ",readonly" : ""}`,
        ]
      : []),
    ...Object.entries(env).flatMap(([key, value]) => [
      "--env",
      key + "=" + value,
    ]),
    image,
  );
}
const execNode = (name, code) => docker("exec", name, "node", "-e", code);
async function ready(name) {
  const address = docker("port", name, "3000/tcp");
  const origin = "http://" + address;
  for (let i = 0; i < 100; i++) {
    if (docker("inspect", "--format", "{{.State.Running}}", name) !== "true")
      throw Error("Fixture container stopped before readiness: " + name);
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.database, "ready");
        assert.equal(health.worker, "ready");
        return origin;
      }
    } catch {}
    await sleep(150);
  }
  throw Error("Container readiness timed out.");
}
async function fails(name) {
  for (let i = 0; i < 100; i++) {
    const state = JSON.parse(
      docker("inspect", "--format", "{{json .State}}", name),
    );
    if (!state.Running) {
      assert.equal(state.ExitCode, 1);
      const log = spawnSync("docker", ["logs", name], {
        encoding: "utf8",
        timeout: 10000,
      });
      assert.match(log.stdout + log.stderr, /Container preflight failed/);
      return;
    }
    await sleep(100);
  }
  throw Error("Invalid fixture remained running.");
}
function check(name) {
  checks.push(name);
  console.log(JSON.stringify({ check: name, status: "passed" }));
}
function helper(data, code, extra = []) {
  docker(
    "run",
    "--rm",
    "--user",
    "0",
    "--entrypoint",
    "node",
    "--mount",
    `type=volume,source=${data},target=/app/data,volume-nocopy`,
    ...extra,
    image,
    "-e",
    code,
  );
}
const rows = (name) =>
  JSON.parse(
    execNode(
      name,
      "const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH);console.log(JSON.stringify(d.prepare('SELECT * FROM deployment_probe ORDER BY id').all()));d.close()",
    ),
  );
try {
  const inspected = JSON.parse(docker("image", "inspect", image))[0];
  assert.equal(inspected.Config.User, "node");
  const imageFiles = JSON.parse(
    docker(
      "run",
      "--rm",
      "--entrypoint",
      "node",
      image,
      "-e",
      "const f=require('node:fs');let writable=true;try{f.accessSync('/app/scripts/container-start.mjs',f.constants.W_OK)}catch{writable=false}console.log(JSON.stringify({env:f.readdirSync('/app').filter(x=>x==='.env'||x.startsWith('.env.')),data:f.readdirSync('/app/data'),program_uid:f.statSync('/app/scripts/container-start.mjs').uid,program_writable:writable}))",
    ),
  );
  assert.deepEqual(imageFiles, {
    env: [],
    data: [],
    program_uid: 0,
    program_writable: false,
  });
  check(
    "image excludes env/database contents, protects program files and defaults to node",
  );
  const parsedPython = JSON.parse(
    docker(
      "run",
      "--rm",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--entrypoint",
      "node",
      image,
      "-e",
      `const {spawnSync}=require('node:child_process');
       const p=spawnSync('python3',['-I','-S','-X','utf8','/app/scripts/python-index.py'],{
         input:JSON.stringify([{path:'fixture.py',content:'raise RuntimeError("must never execute")\\ndef twice(x): return x * 2\\n'}]),encoding:'utf8',timeout:5000});
       if(p.status!==0)process.exit(1);process.stdout.write(p.stdout);`,
    ),
  );
  assert.equal(parsedPython.format, "repo-salvage/python-ast-v1");
  assert.equal(parsedPython.files[0].status, "ok");
  assert.equal(parsedPython.files[0].declarations[0].symbol, "twice");
  check(
    "packaged isolated Python parser inspects declarations without executing source",
  );
  const nativeSyntax = JSON.parse(
    docker(
      "run",
      "--rm",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--entrypoint",
      "node",
      image,
      "-e",
      `const {spawnSync}=require('node:child_process');const p=spawnSync(process.execPath,['--max-old-space-size=128','/app/scripts/syntax-index.mjs'],{input:JSON.stringify([{path:'fixture.go',content:'package p\\nfunc init(){panic("DO NOT EXECUTE")}\\nfunc Twice(x int) int{return x*2}'},{path:'fixture.rs',content:'mod helper; pub fn twice(x:i32)->i32 { x*2 }'}]),encoding:'utf8',timeout:5000,env:{PATH:'/usr/bin:/bin'}});if(p.status!==0){process.stderr.write(p.stderr);process.exit(1)}process.stdout.write(p.stdout)`,
    ),
  );
  assert.equal(nativeSyntax.format, "repo-salvage/syntax-cst-v1");
  assert.ok(nativeSyntax.files.every((f) => f.status === "ok"));
  assert.ok(
    nativeSyntax.files[0].declarations.some((d) => d.symbol === "Twice"),
  );
  assert.ok(
    nativeSyntax.files[1].declarations.some((d) => d.symbol === "twice"),
  );
  assert.equal(nativeSyntax.files[0].package_name, "p");
  assert.deepEqual(nativeSyntax.files[1].modules, [
    { name: "helper", restricted: false },
  ]);
  check(
    "packaged Go/Rust grammar reports declarations and package/module names offline without source execution",
  );
  const missingMount = id + "-missing-mount";
  run(missingMount, null, { writableImage: true });
  await fails(missingMount);
  check(
    "missing data mount fails before listening instead of creating ephemeral storage",
  );
  const data = volume("data");
  const denied = id + "-root-volume-denied";
  run(denied, data);
  await fails(denied);
  check(
    "default unprivileged startup rejects an uninitialized root-owned mount",
  );
  const first = id + "-first";
  run(first, data, { root: true });
  const origin = await ready(first);
  assert.match(
    execNode(
      first,
      "console.log(require('node:fs').readFileSync('/proc/1/status','utf8').match(/^Uid:.*$/m)[0])",
    ),
    /^Uid:\s+1000\s+1000\s+1000\s+1000$/,
  );
  check("root-owned volume initialized; actual server PID runs as UID 1000");
  for (const route of [
    "/",
    "/agents",
    "/examples/assignment",
    "/examples/integer",
    "/llms.txt",
    "/openapi.json",
    "/api/v1/parts",
    "/api/v2/parts",
  ]) {
    const response = await fetch(origin + route, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, route);
    await response.arrayBuffer();
  }
  const archives = {};
  for (const file of [
    "summary-parser.tar.gz",
    "assignment-consumer.tar.gz",
    "integer-word-consumer.tar.gz",
    "repo-salvage-cli.tgz",
    "repo-salvage-mcp.tgz",
    "rust-edit-distance.tar.gz",
    "go-rendezvous-consumer.tar.gz",
  ]) {
    const response = await fetch(origin + "/" + file);
    assert.equal(response.status, 200, file);
    archives[file] = createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("hex");
    assert.equal(
      archives[file],
      execNode(
        first,
        `console.log(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('/app/public/${file}')).digest('hex'))`,
      ),
    );
  }
  check(
    "application, agent API and all seven downloads served from built image",
  );
  assert.equal(
    execNode(
      first,
      "console.log(require('typescript').createSourceFile('test.ts','export const value = 1',99,true).statements.length)",
    ),
    "1",
  );
  execNode(
    first,
    "const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH);d.pragma('wal_autocheckpoint=0');d.exec(\"CREATE TABLE deployment_probe (id INTEGER PRIMARY KEY, value TEXT);INSERT INTO deployment_probe VALUES (1,'committed');INSERT INTO summary_runs VALUES (123,datetime('now'))\");d.close()",
  );
  const backup = JSON.parse(
    docker(
      "exec",
      "--user",
      "1000",
      first,
      "node",
      "scripts/backup-db.mjs",
      "/app/data/probe-backup.db",
    ),
  );
  assert.equal(backup.status, "ok");
  assert.equal(
    Number(
      execNode(
        first,
        "console.log(require('node:fs').statSync('/app/data/probe-backup.db').mode & 511)",
      ),
    ),
    0o600,
  );
  check(
    "online SQLite backup from running application is private and integrity checked",
  );
  // These synthetic jobs have no provider credentials and no real source. The
  // worker must recover their persisted states even when analysis is disabled.
  execNode(
    first,
    `const d=new(require('better-sqlite3'))(process.env.DATABASE_PATH);
    const now=Date.now();d.transaction(()=>{
      for(const [n,stage] of ['inspection','unknown','response'].entries()){
        const token='fixture-analysis-'+n;
        d.prepare('INSERT INTO active_analyses VALUES (?,?,?,?)').run(700+n,123,token,now+86400000);
        d.prepare(\`INSERT INTO analysis_jobs (id,owner_id,repo_id,repo_name,source_sha,request_key,payload_hash,analysis_token,model,status,created_at,updated_at,deadline,lease_token,lease_expires_at,inspection_attempts,provider_started_at,checkpoint_json,response_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)\`).run('fixture-'+stage,123,700+n,'fixture/source','a'.repeat(40),'fixture-request-'+n,'fixture-hash',token,'fixture-model',stage==='inspection'?'inspecting':'generating',now,now,now+86400000,'fixture-lease-'+n,now+60000,1,stage==='inspection'?null:now,JSON.stringify({fixture:'saved-source'}),stage==='response'?JSON.stringify({fixture:'saved-response'}):null);
      }
    })();d.close();`,
  );
  const writer = spawn(
    "docker",
    [
      "exec",
      first,
      "node",
      "-e",
      "const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH);d.exec(\"BEGIN IMMEDIATE;INSERT INTO deployment_probe VALUES (2,'uncommitted')\");console.log('transaction-open');setInterval(()=>{},1000)",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const writerExit = new Promise((resolve) => writer.once("exit", resolve));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      writer.kill();
      reject(Error("Writer fixture timed out"));
    }, 10000);
    writer.stdout.once("data", (bytes) => {
      clearTimeout(timer);
      assert.match(bytes.toString(), /transaction-open/);
      resolve();
    });
    writer.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  docker("kill", "--signal", "KILL", first);
  await writerExit;
  helper(
    data,
    "const d=new(require('better-sqlite3'))('/app/data/salvage.db');d.prepare('UPDATE analysis_jobs SET lease_expires_at=0').run();d.close()",
  );
  docker("start", first);
  const restartedOrigin = await ready(first);
  assert.deepEqual(rows(first), [{ id: 1, value: "committed" }]);
  assert.equal(
    execNode(
      first,
      "const d=new(require('better-sqlite3'))(process.env.DATABASE_PATH);console.log(d.prepare('SELECT count(*) n FROM summary_runs').get().n);d.close()",
    ),
    "1",
  );
  check(
    "SIGKILL/restart preserves committed data and quota; open transaction rolls back",
  );
  const recoveredJobs = JSON.parse(
    execNode(
      first,
      "const d=new(require('better-sqlite3'))(process.env.DATABASE_PATH);console.log(JSON.stringify(d.prepare('SELECT id,status,checkpoint_json,response_json,provider_started_at FROM analysis_jobs ORDER BY id').all()));d.close()",
    ),
  );
  assert.deepEqual(
    recoveredJobs.map(({ id, status }) => ({ id, status })),
    [
      { id: "fixture-inspection", status: "queued" },
      { id: "fixture-response", status: "queued" },
      { id: "fixture-unknown", status: "needs_attention" },
    ],
  );
  assert.ok(recoveredJobs[0].checkpoint_json);
  assert.ok(recoveredJobs[1].response_json);
  assert.equal(recoveredJobs[2].checkpoint_json, null);
  assert.equal(recoveredJobs[2].response_json, null);
  assert.ok(recoveredJobs[2].provider_started_at);
  check(
    "worker resumes saved checkpoints after SIGKILL and pauses an uncertain provider request without credentials or calls",
  );
  const privateProgress = await fetch(
    restartedOrigin + "/api/analysis-jobs/fixture-inspection",
    { signal: AbortSignal.timeout(10000) },
  );
  assert.equal(privateProgress.status, 401);
  assert.equal(
    privateProgress.headers.get("cache-control"),
    "private, no-store",
  );
  check("persisted analysis progress remains private to the signed-in owner");
  docker("stop", first);
  docker("rm", first);
  const next = id + "-replacement";
  run(next, data);
  await ready(next);
  assert.deepEqual(rows(next), [{ id: 1, value: "committed" }]);
  check("replacement unprivileged container retains the same mounted database");
  for (let i = 0; i < 100; i++) {
    if (
      docker("inspect", "--format", "{{.State.Health.Status}}", next) ===
      "healthy"
    )
      break;
    await sleep(500);
  }
  assert.equal(
    docker("inspect", "--format", "{{.State.Health.Status}}", next),
    "healthy",
  );
  check("Docker healthcheck observes ready database");
  const memory = JSON.parse(
    docker("stats", "--no-stream", "--format", "{{json .}}", next),
  ).MemUsage;
  docker("stop", next);
  const restored = volume("restored");
  helper(
    restored,
    "require('node:fs').copyFileSync('/backup/probe-backup.db','/app/data/salvage.db')",
    ["--mount", `type=volume,source=${data},target=/backup,readonly`],
  );
  const recovered = id + "-recovered";
  run(recovered, restored, { root: true });
  await ready(recovered);
  assert.deepEqual(rows(recovered), [{ id: 1, value: "committed" }]);
  check("backup restores into a fresh volume and serves successfully");
  docker("stop", recovered);
  const readOnly = id + "-readonly";
  run(readOnly, restored, { readonly: true });
  await fails(readOnly);
  check("read-only data volume fails before listening");
  const invalid = id + "-invalid-config";
  const invalidEnv = { ...environment };
  delete invalidEnv.AUTH_SECRET;
  run(invalid, restored, { env: invalidEnv });
  await fails(invalid);
  check("missing auth secret fails before listening");
  const corrupt = volume("corrupt");
  helper(
    corrupt,
    "require('node:fs').writeFileSync('/app/data/salvage.db','not a database')",
  );
  const corruptServer = id + "-corrupt";
  run(corruptServer, corrupt, { root: true });
  await fails(corruptServer);
  check("corrupt database fails before listening");
  const proxy = id + "-proxy";
  const canonical = "https://salvage.example.test";
  run(proxy, restored, {
    env: {
      ...environment,
      AUTH_URL: canonical,
      AUTH_GITHUB_ID: "fixture-client",
      AUTH_GITHUB_SECRET: "fixture-secret",
    },
  });
  const proxyOrigin = await ready(proxy);
  const forwarded = {
    "x-forwarded-host": "untrusted.example.test",
    "x-forwarded-proto": "https",
  };
  const csrf = await fetch(proxyOrigin + "/api/auth/csrf", {
    headers: forwarded,
  });
  assert.equal(csrf.status, 200);
  const token = (await csrf.json()).csrfToken;
  const cookies = csrf.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const signin = await fetch(proxyOrigin + "/api/auth/signin/github", {
    method: "POST",
    redirect: "manual",
    headers: {
      ...forwarded,
      Cookie: cookies,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
      Origin: canonical,
    },
    body: new URLSearchParams({
      csrfToken: token,
      callbackUrl: canonical + "/dashboard",
    }),
  });
  const authorization = new URL(
    signin.headers.get("location") ?? (await signin.json()).url,
  );
  assert.equal(authorization.hostname, "github.com");
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    canonical + "/api/auth/callback/github",
  );
  assert.equal(authorization.searchParams.get("scope"), "read:user");
  assert.ok(
    signin.headers.getSetCookie().some((cookie) => /; Secure/i.test(cookie)),
  );
  check(
    "HTTPS proxy sign-in uses canonical callback and secure cookies; GitHub redirect not followed",
  );
  console.log(
    JSON.stringify({
      status: "passed",
      image_id: inspected.Id,
      architecture: inspected.Architecture,
      checks: checks.length,
      memory_after_smoke: memory,
      memory_limit: "512 MiB",
      archives,
      provider_calls: 0,
      real_credentials_used: false,
    }),
  );
} finally {
  for (const name of containers) {
    try {
      docker("rm", "-f", name);
    } catch {}
  }
  for (const name of volumes) {
    try {
      docker("volume", "rm", name);
    } catch {}
  }
}
