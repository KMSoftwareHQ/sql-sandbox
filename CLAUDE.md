# CLAUDE.md

## Project

**SQL Fiddle (in-browser)** — an open-source, account-free SQL playground for learning SQL,
inspired by db-fiddle.com. Everything runs in the browser:

- No backend, no accounts, no telemetry.
- Session state persists in `localStorage`.
- Users download their session as a `.sql` file and load it later to pick up where they left off.
- Dark and light themes.
- Engines run as WebAssembly: SQLite (`sql.js`) and PostgreSQL (`@electric-sql/pglite`).

Audience is people learning SQL: keep the UI simple, errors readable, and code approachable.

## Stack

- Vite + vanilla JavaScript (ES modules), no framework.
- CodeMirror 6 for the editors.
- `npm run dev` / `npm run build` / `npm test`.

## Session file format (`.sql`)

A downloaded session is valid, runnable SQL. Metadata lives in marker comments:

```sql
-- @fiddle engine=sqlite
-- @fiddle section=schema
CREATE TABLE ...;
-- @fiddle section=query
SELECT ...;
```

A plain `.sql` file without markers is loaded entirely into the schema editor.
Changes to this format must stay backward compatible.

## Versioning and branches

- Semantic Versioning (`MAJOR.MINOR.PATCH`), tags are `vX.Y.Z`.
- `master` — stable. Only receives merges from release branches (and hotfixes).
- `development` — experimental. Feature branches (`feature/<name>`) merge here.
- Release flow:
  1. Branch `release/vX.Y.Z` from `development`. The branch is now **frozen**: bug fixes only.
  2. Bump `package.json` version, update `CHANGELOG.md`.
  3. Merge into `master`, tag `vX.Y.Z` on master, merge back into `development`.
- Never commit directly to `master`.

## Open-source hygiene

This is a public repository.

- Never commit PII: no personal names, emails, usernames, local paths, tokens, or keys.
  Commits use the maintainer's GitHub noreply address; never a personal email.
- Before every commit, review `git diff --cached` for anything confidential.
- Keep docs and code clear and concise.

## Working rules

1. **Verify, don't assume.** Comments, docstrings and function names can be stale. Read the
   implementation, or run it or its tests, before relying on what code is supposed to do. If the
   intended behaviour is unclear, ask the prompter instead of guessing. Test the real path: a dry
   run or a mock only tests control flow. Never hand over a command you haven't run without
   saying so.
2. **Readable code.** A human reviews everything. Use descriptive names (`retryCount`, not `rr`)
   and match the surrounding code's style and comment density.
3. **Check every commit for secrets and private data:** API keys, tokens, passwords, `.env` or
   credential files, internal URLs, hostnames and IPs, email addresses, personal file paths
   (`/home/<user>/...`), and customer or company data. If anything looks sensitive, stop and ask.
4. **Git and PRs.** One PR = one change; unrelated fixes, refactors and docs go in separate PRs.
   Check `git branch` and `git status` before every commit, amend or reset. Don't push or open a
   PR until the prompter approves.
5. **You write the code by default.** Don't delegate code writing to subagents. Use subagents
   only for:
   - parallel independent fixes (one agent and one worktree each)
   - broad codebase searches
   - independent review: a fresh agent tries to break your finished diff
   - long, noisy runs (test suites, migrations)
   - mechanical bulk edits (renames, repetitive config)

   Use Sonnet for searches, runs and bulk edits; use your own model for reviews.
6. **Review every change, including your own:** scope matches what was agreed; failure paths
   (error, timeout, retry, partial run); input validation and auth; grep for other callers;
   re-run the tests yourself and check that the assertions prove the claim.
7. **Before opening a PR,** explain in plain words: the problem, what the change does, its size
   (fix vs tests vs extras), what was and wasn't tested, and any merge order. Wait for approval.
   Remove worktrees after the merge.

### High-risk areas (independent review every time)

- Executing user-written SQL in the browser: runaway queries that freeze the tab, huge result
  sets that exhaust memory, and engine errors that must not crash the app.
- Loading `.sql` session files: treat file contents as untrusted; never render them as HTML.
- Session file format and `localStorage` schema changes: keep them backward compatible.
- Anything that would add network calls, a backend, or accounts (out of scope; ask first).
