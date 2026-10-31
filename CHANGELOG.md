# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1] - 2026-10-31

### Fixed

- Reloading the page no longer leaves an empty database: if you had built one, every tab runs again
  to rebuild it. If the previous run never finished (for example a query that froze the page), the
  rebuild is skipped with a notice so the page cannot freeze again on load.

## [0.4.0] - 2026-10-31

### Added

- MySQL engine: real MariaDB compiled to WebAssembly (`lite4mariadb`), lazy-loaded in a Web
  Worker. Tutorial scripts with `CREATE DATABASE`, `USE`, backticks and `ENGINE=InnoDB` run as-is.
- Workbench-style tabs over one persistent database: Run (selection or tab), Run all, Reset database.
- Schema sidebar listing databases, tables, columns and primary keys; double-click a table to
  insert a `SELECT`.
- Open several `.sql` files at once; plain scripts open as new tabs.
- Warning when autosave fails because browser storage is full.

### Changed

- **License is now GPL-2.0-only** (was MIT), required to bundle MariaDB.
- Session files use `-- @fiddle file=<name>` markers, one per tab. Files from 0.1–0.3 still open.
  Opening a session file rebuilds the database by running every tab.
- Result tables render at most 1000 rows each.
- Cross-origin isolation headers (COOP/COEP) are sent, as the MySQL engine requires.

### Known issues

- MySQL: stored procedures, functions and events are not supported by the in-browser build.
- MySQL: duplicate column names in one result are merged (a warning suggests aliases).
- A long-running query cannot be cancelled; reload the page to recover.

## [0.3.1] - 2026-10-31

### Security

- Security headers: Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`; framing disallowed.
- nginx no longer reports its version.

### Changed

- README: live demo link, screenshot and "How it works" section.

## [0.3.0] - 2026-10-31

### Added

- Docker deployment: multi-stage build served by nginx on `127.0.0.1:8110`
  (configurable via `SQL_SANDBOX_PORT`), ready to sit behind a reverse proxy.

## [0.2.0] - 2026-10-31

### Changed

- Renamed to SQL Sandbox. Browser storage keys are now `sql-sandbox:*`, so autosaved sessions
  from 0.1.0 are not restored; downloaded `.sql` files still load.
- Downloads are named `sql-sandbox-YYYY-MM-DD.sql`.
- Build uses relative asset paths so it can be hosted under a subpath.

## [0.1.0] - 2026-10-31

### Added

- In-browser SQL playground with SQLite (`sql.js`) and PostgreSQL (`@electric-sql/pglite`) engines, loaded lazily.
- Schema and query editors (CodeMirror 6) with a results panel, execution time, and distinct `NULL` display.
- Fresh database on every run; one result per statement; schema vs query error reporting.
- Run via button or Ctrl/Cmd+Enter.
- Autosave to `localStorage` and restore on load.
- Download/load sessions as runnable `.sql` files with `-- @fiddle` marker comments.
- Reset to a generic students/courses example, also shown on first visit.
- Dark and light themes, defaulting to the system preference.
- Responsive layout that stacks the editors on narrow screens.
- Unit tests for the session file format and the SQLite engine.
