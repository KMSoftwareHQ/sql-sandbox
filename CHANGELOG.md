# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-31

### Changed

- Renamed to SQL Sandbox. Browser storage keys are now `sql-sandbox:*`, so autosaved sessions
  from 0.1.0 are not restored; downloaded `.sql` files still load.
- Downloads are named `sql-sandbox-YYYY-MM-DD.sql`.
- Build uses relative asset paths so it can be hosted under a subpath.

### Fixed

- Download link URL is revoked after the download starts (some browsers aborted it).
- Ctrl/Cmd+Enter inside an editor no longer triggers a second run attempt.

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
