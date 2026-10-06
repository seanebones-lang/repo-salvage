<img width="1168" height="784" alt="VVMR1" src="https://github.com/user-attachments/assets/51c32ebe-8aa0-4bde-8186-9d468bb57a23" />
# Repo Salvage

Developers list their abandoned public GitHub repos; others browse them and lift the reusable parts.

## How it works
1. Sign in with GitHub (scope: `read:user` only; public repo data needs no extra scope).
2. Your public, non-fork repos are listed, inactive (12+ months) first.
3. Mark a repo "Available for salvage" with an optional note. The app samples the repo (tree, manifests, README, a few source files) and makes **one** Claude call (structured JSON output, medium effort) that returns languages, frameworks and 3–6 reusable pieces. Sampling is pinned to one source commit. Paths are validated against the complete file tree, separately from the bounded prompt tree; sampled paths are always included in that prompt. Failed sample reads, incomplete GitHub trees and empty verified summaries stop publication.
4. License, stars/forks and the last non-bot commit date come from the GitHub API.
5. `/` is a public, searchable index (keyword, language, license). `/listing/:id` shows the detail page and an anonymous "I forked / used this" counter.

Repo content is sent to the model as delimited, untrusted data; AI-written text is stripped of URLs and markdown before storage.

Only repos you explicitly mark are stored, and only public data. My Listings keeps removal controls even when GitHub inventory fails or a repository becomes private, is deleted, or is transferred. Public pages and listing endpoints anonymously recheck repository visibility and current ownership on each request and hide unverified listings. This fails closed during GitHub outages or anonymous API rate limits. Source sampling also uses anonymous reads, so authenticated access cannot read newly private source for a summary.

## Setup
```bash
npm install
cp .env.example .env.local
```
Fill in `.env.local`:
- `AUTH_SECRET`: `openssl rand -base64 32`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`: create an OAuth app at https://github.com/settings/developers with callback `http://localhost:3000/api/auth/callback/github`
- `ANTHROPIC_API_KEY`
- optional: `DAILY_SUMMARY_LIMIT` (default 10 summaries per user per day)

```bash
npm run dev   # http://localhost:3000
```

## Stack
Next.js (App Router) · Auth.js v5 · SQLite (`better-sqlite3`, file at `data/salvage.db`) · Anthropic SDK.

## Notes and limits (v1)
- SQLite needs a persistent disk (Fly, Railway, a VPS). On Vercel/serverless swap `src/lib/db.ts` for Postgres/Turso.
- New summaries store the source commit, analysis time and returned model identifier; component links use that commit. Existing SQLite databases are migrated additively. Legacy summaries have unknown provenance and need re-summarization to regain component links.
- Summaries are AI-generated from a sample and may miss things; the listing page says so.
- The "used" counter is anonymous and only deduplicated client-side, so it is easy to inflate.
- Tests: `npm test` (vitest; db, search, rate limit, GitHub helpers, summary parsing). CI runs typecheck, tests, audit and build.
- Reports: the "Report" button on a listing writes to the `reports` table (`sqlite3 data/salvage.db "select * from reports"`). There is no moderation UI yet; delete a listing by removing its row from `listings`.
- Not in v1: payments, messaging, project transfer, re-sync when a repo changes (use "Re-summarize").
