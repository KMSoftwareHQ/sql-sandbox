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

- Never trust comments or function names. Verify code works as documented; if unsure how
  something should behave, ask the prompter.
- Use descriptive function and variable names (no `rr`, `nn`). A human reviews this code;
  readability beats brevity.
- Orchestration: the main agent is the orchestrator. Spawn Sonnet agents to write code,
  then review their work, approve it, or send back specific feedback to fix.
- In a public repo, always check that nothing confidential is committed.
