# Hosting and deployment readiness

Reviewed 2026-10-08 (America/Chicago). Container evidence is local; a public
hosting service, domain, production OAuth callback and production-provider request
have not been provisioned or validated. Costs below were checked against official
provider pages on this date and are estimates before tax and future price changes.

## Recommended first deployment

Use one Docker service on Railway with one persistent volume at `/app/data`.
Start as a small curated pilot, with analysis disabled until the production login,
moderation and provider setup have been verified. Keep the existing stdio MCP
adapter: agents install it locally and point it at the public HTTPS catalog.
There is no separate hosted MCP process to pay for.

Render is a suitable alternative if a fixed instance price matters more than
usage billing. Both providers' disk-backed services are limited to one instance
and briefly interrupt traffic during deployments. This matches the current SQLite
architecture; horizontal scaling requires a storage and coordination change.
See [Railway volume constraints](https://docs.railway.com/volumes/reference) and
[Render disk constraints](https://render.com/docs/disks).

| Option          | Starting cost and sizing                                                                                                                                                                   | What remains variable                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Railway Hobby   | $5 monthly minimum including $5 usage. Budget $10–15/month initially, then size from real measurements. RAM is roughly $10/GB-month and CPU $20/vCPU-month at continuous full utilization. | Actual CPU/RAM use, disk/backups and egress. This budget is our planning allowance, not a quote. |
| Render Starter  | $7/month for 512 MB / 0.5 CPU, plus $0.25 for a provisioned 1 GB disk: $7.25 base.                                                                                                         | Usage above included bandwidth/build allowances, off-service backup storage and AI analysis.     |
| Render Standard | $25/month for 2 GB / 1 CPU, plus a 1 GB disk: $25.25 base.                                                                                                                                 | Same extras; useful if the measured pilot needs more memory.                                     |

Sources: [Railway pricing](https://railway.com/pricing),
[Render instance sizes](https://render.com/articles/render-vs-railway),
[Render disk pricing](https://render.com/pricing).

AI analysis is billed separately by Anthropic. Existing request allowances are
not dollar caps. Set a provider-side budget appropriate to the selected workspace,
verify what enforcement that account supports, and keep small application request
limits. The temporary local testing key is not assumed to be a production key.
A platform-provided HTTPS hostname is sufficient initially; using an existing
subdomain avoids a new domain purchase. No billing account was changed here.

The 512 MB container smoke run covers startup, ordinary pages/downloads, local
SQLite recovery and an OAuth authorization redirect. Its sampled memory after
those checks is not peak memory or a load test. Production GitHub latency, bursts,
concurrent analyses and large catalogs still need measurement.

## Service setup

1. Deploy the repository's Dockerfile from the reviewed commit. It uses a pinned
   Node 22 multi-platform image digest. Update that digest deliberately through CI.
   Build dependencies include the MCP workspace manifest before `npm ci`.
2. Use a single replica and attach a persistent disk at `/app/data`.
   `DATABASE_PATH=/app/data/salvage.db` includes the database and its WAL/SHM files
   on the same persistent filesystem. Do not mount the application root or use
   multiple SQLite writers in different replicas/regions.
3. Leave the image's start command as `node scripts/container-start.mjs`.
   `HOSTNAME=0.0.0.0` is supplied by the image; it listens on the platform's `PORT`.
   Set the provider's deployment health path to `/api/health`.
4. Set `AUTH_URL` to the one canonical HTTPS origin, and generate a new persistent
   `AUTH_SECRET` with `openssl rand -base64 32`. Store it as a runtime secret.
   The container rejects missing/short secrets, noncanonical origins, malformed
   limits and incomplete OAuth pairs before listening. Changing this secret
   invalidates existing sessions.
5. Configure a separate production GitHub OAuth application with the exact
   `${AUTH_URL}/api/auth/callback/github` callback, public-profile scope only.
   Preserve the local application's callback so local development keeps working.
   Set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` in the service's secret environment,
   never Docker build arguments or repository files. Completing production login
   is a separate live gate; the smoke redirect uses dummy credentials and never
   follows the GitHub authorization URL.
6. Set `MODERATOR_GITHUB_IDS` to the operator's verified numeric GitHub ID.
   Choose `AGENT_READ_LIMIT=5` as a conservative initial shared per-minute cap;
   raise it only with GitHub allowance and latency measurements. Each search
   verifies visible repositories; request limits do not guarantee upstream quota.
7. Initially set `GLOBAL_DAILY_SUMMARY_LIMIT=0` and `DAILY_SUMMARY_LIMIT=0`.
   Public retrieval uses no paid analysis. After live owner/login/provider checks,
   configure a current Anthropic key/workspace and explicit model, then choose
   small allowances, for example three attempts per owner and ten globally.
   The container requires an operator when a configured provider and allowances
   enable paid analysis. Application quotas survive restarts and backups.

### Mounted-volume ownership

The image defaults to `USER node`; program files remain root-owned and cannot be
modified by the application user. A host-created volume may be owned by root.
On Railway, the documented compatibility setting is `RAILWAY_RUN_UID=0`.
This image's preflight then repairs ownership only for `/app/data` and the
configured database/WAL/SHM files and immediately drops groups/GID/UID to 1000
**before opening SQLite or importing the server**. The server does not run as root.
Symlinks in those ownership targets are rejected. Custom database mount paths
must be initialized separately when using root startup.

A Docker named volume normally inherits the image directory ownership. For a
root-owned fresh mount, run once with `--user 0` through the unchanged image start
command. Subsequent runs can use the default unprivileged user. Do not override
the start command to `node server.js`, which skips these checks.

See [Railway's volume permissions](https://docs.railway.com/volumes#permissions).
The root-bootstrap path and actual server UID are verified in the smoke test;
a specific hosting account's volume permissions still need live verification.

## Backups, migration and restoration

Backups contain private owner context, proposal data and credential hashes as well
as the public catalog. Keep them private and outside served assets. The online
SQLite backup command retains committed WAL data, checks source/output integrity,
creates mode-0600 files, and refuses to overwrite an existing destination.
Use SQLite's backup API instead of copying only an active `.db` file.

From a running container, after creating a private backup directory owned by the
application user:

```sh
docker exec --user 1000 CONTAINER mkdir -p /app/data/backups
docker exec --user 1000 CONTAINER node scripts/backup-db.mjs /app/data/backups/NEW_UNIQUE_NAME.db
```

Use a new name per backup. Export a successful backup into private off-service
storage; a copy on the same volume does not survive loss of that volume. Retain
at least daily and pre-upgrade backups, and periodically restore one into a
separate service/volume. Provider disk snapshots can supplement this process;
application-consistent backups and a restore drill remain necessary.

For the initial catalog migration, make an online local backup, validate expected
counts/integrity, upload only that snapshot to a fresh target volume, fix its
ownership, then start the target app. Do not upload `.env.local`, raw recordings
or source-machine session material. The local readiness check created a private
143360-byte snapshot with seven listings, 34 parts and nine summary runs; zero
credentials/drafts were present. It remains local under ignored artifacts.

For recovery, stop the target service and preserve its damaged database plus
WAL/SHM as an incident copy. Restore into a **fresh volume** to avoid replaying old
WAL state over a restored file. Start the reviewed image, require a healthy
`/api/health`, verify catalog/owner/quota state, then reroute traffic. An image
rollback does not roll back data or undo future migrations; back up before every
schema-changing upgrade. Existing migrations are additive.

## Monitoring and operating limits

Configure HTTPS uptime monitoring separately from deployment health. Railway's
health path is checked at deployment startup, not continuously:
[healthcheck behavior](https://docs.railway.com/deployments/healthchecks).
Docker's image healthcheck records readiness but Docker alone does not restart an
unhealthy running process. Configure the hosting service's restart policy and
alerts for exits, repeated health failures, full disks and upstream 429/503s.

`/api/health` checks database access. Container preflight adds writable-directory,
read/write-file and SQLite quick-check validation. Neither proves live GitHub,
OAuth, Anthropic billing or customer traffic. Verify those separately after the
host exists. Logs deliberately omit credentials and private source/context.

Deployments can interrupt in-flight paid analysis. Keep approval traffic quiet
while upgrading; failed/crashed reservations consume quota, expire after ten
minutes, and require deliberate owner retry. There is no automatic model retry
or fallback that hides a possible charge. This smoke drill checks SQLite crash
atomicity and persisted quota, not a real provider request killed mid-flight.

## Repeat the readiness checks

```sh
npm ci
npm test
npm run typecheck
npm run format:check
npm audit --audit-level=high
docker build -t repo-salvage:readiness .
npm run test:container
```

The explicit smoke command creates disposable local volumes/containers, forwards
no real credentials, makes no repository analysis calls, and removes its fixtures.
It verifies mounted storage, actual UID, application/download delivery, online
backup, SIGKILL rollback, replacement-container persistence, fresh-volume restore,
Docker health, invalid/read-only/corrupt storage rejection and the canonical
HTTPS OAuth redirect. CI runs it on Linux amd64; local verification uses arm64.

Gzip platform tags in the two example bundles are normalized to Unix. The Linux
and macOS tar payloads were already byte-identical; the old platform tag changed
the compressed archive fingerprint. The normalized assignment archive SHA-256 is
`ffbfdf0a6770a2b4b8f8705aed566320d2901d0f2e4fb354c20a154ac0f869f5`.
Historical fingerprints in earlier validation records remain dated evidence.
MCP and CLI archives retain their prior hashes.
