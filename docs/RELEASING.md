# Package and verify a release

The application version is in the root `package.json` and lockfile. The CLI and
MCP adapter have their own package versions. Keep those identities distinct in
the manifest and release notes; do not imply npm publication or a hosted service.

The full test suite requires `python3` **3.11 or later on PATH** in addition to
Node.js 22. Check `python3 --version`; macOS may still resolve its system Python
3.9 even when a newer interpreter is installed. Choose the supported interpreter
for that command environment. The public demo and JavaScript parser adaptation
need only Node.js; Python inspection otherwise reports its unavailable-parser
fallback rather than executing target code.

1. Run `npm ci`, `npm run format:check`, `npm run typecheck`, `npm test`,
   `npm run test:native`, and `npm audit --audit-level=high`.
2. Run `npm run build`, `npm run test:packages` and `npm run test:demo`.
   The demo smoke runs the built loopback application and downloads/tests the
   parser adaptation outside the checkout with OAuth and paid analysis disabled.
3. Review, commit and merge the release preparation after CI passes. CI also
   builds the Docker image and tests persistence, recovery and packaged consumers.
4. Build again from the exact merged commit and run `npm run package:release`.
   The source archive uses only committed Git files; local credentials, databases
   and ignored artifacts are excluded. Build the public archives freshly before
   packaging. `artifacts/releases/v<VERSION>` contains named assets, source commit,
   application/client versions and SHA-256 checksums. Do not upload by a stale glob.
5. Extract the source archive in a fresh directory. Follow `docs/QUICKSTART.md`
   without a `.env.local`. Install CLI/MCP archives outside the checkout and run
   their packaged checks. Use examples with retained notices; no real account
   or paid provider calls are needed for this release validation.
6. Publish `v<VERSION>` at that reviewed commit, attaching all manifest-listed
   assets, the manifest and `SHA256SUMS`. Download them again and compare hashes.
   Document actual platforms/checks and limits in the release notes. Confirm the
   exact tag commit, latest-release identity and post-merge CI before closing.

The demo's curated briefs and controlled adaptations do not certify catalog
components, arbitrary extraction, independent usefulness, or your integration.
