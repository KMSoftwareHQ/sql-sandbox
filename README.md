# SQL Sandbox

An open-source, account-free SQL playground for learning SQL, inspired by db-fiddle.com.
Everything runs in your browser as WebAssembly: no backend, no accounts, no telemetry.

**Live demo: [kmsoftware.net/sql-sandbox](https://kmsoftware.net/sql-sandbox/)**

![SQL Sandbox in dark theme: schema and query editors with a results table](docs/screenshot.png)

## Features

- Engines: SQLite (`sql.js`), PostgreSQL (`@electric-sql/pglite`) and MySQL (real MariaDB via
  [`lite4mariadb`](https://github.com/shyim/lite4mariadb)), each loaded lazily on first use.
  MySQL tutorial scripts with `CREATE DATABASE`, `USE`, backticks and `ENGINE=InnoDB` work as-is.
- Workbench-style: multiple SQL tabs running against one live database. Run the selection or the
  whole tab (Ctrl/Cmd+Enter), run every tab in order, or reset the database.
- Schema sidebar listing databases, tables and columns (with primary keys); double-click a table
  to insert a `SELECT`.
- Result tables per statement, "N rows affected" / "OK" for the rest, execution time, distinct `NULL`.
- Autosave of your tabs to `localStorage`; dark and light themes (follows the system by default).
- Download every tab as one runnable `.sql` file and open it later to rebuild the database.

## How it works

- The SQL engines are compiled to WebAssembly and run inside the browser tab. Your queries never
  reach a server; the server only hosts static files.
- The database lives in memory for the session and keeps its state between runs. It is not saved:
  after a reload, press Run all (or open your `.sql` file) to rebuild it. Results are inserted as
  text, never as HTML.
- Engines are lazy-loaded the first time you pick them, so the initial page stays small. The
  MySQL engine is served unmodified from `public/vendor/` (copied from `node_modules` by
  `scripts/copy-vendor-engines.mjs` before dev and build) and runs in a Web Worker.
- Your session autosaves to `localStorage`. Downloading it produces a plain, runnable `.sql` file
  with marker comments, which the app reads back on load.

## MySQL engine notes

- It is MariaDB 13.1, so almost all MySQL syntax works. A session starts in an empty `sandbox`
  database; scripts can `CREATE DATABASE` and `USE` their own.
- Not supported yet by the in-browser build: stored procedures, functions and events.
  Views, triggers, transactions, CTEs, window functions and JSON functions work.
- Columns with duplicate names in one result (e.g. `a.id, b.id`) need distinct aliases.
- The engine is about 17 MB (5.5 MB compressed), downloaded only when you pick MySQL. It needs
  cross-origin isolation (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
  headers), which the bundled nginx config sends.

## Quick start

```sh
npm install
npm run dev      # development server
npm test         # unit tests (vitest)
npm run build    # production build in dist/
npm run preview  # serve the production build
```

## Deploying

With Docker:

```sh
docker compose up -d --build   # serves on 127.0.0.1:8110 (set SQL_SANDBOX_PORT to change)
```

Put a reverse proxy in front to expose it publicly; it can be mounted under any subpath.
Without Docker:

`npm run build` outputs a static site in `dist/` with relative asset paths, so it can be served
from any subpath (for example `https://example.com/sql-sandbox/`). Any static file host works;
make sure `.wasm` files are served as `application/wasm`.

## Session file format

A downloaded session is valid, runnable SQL. Metadata lives in marker comments:

```sql
-- @fiddle engine=sqlite
-- @fiddle file=schema.sql
CREATE TABLE ...;
-- @fiddle file=queries.sql
SELECT ...;
```

Each `file=` marker starts a tab. Markers are case-insensitive and an unknown engine falls back
to `sqlite`. A plain `.sql` file without markers (for example a tutorial script) opens as a new
tab. Files saved by v0.1–v0.3 (`section=schema` / `section=query`) still open, as two tabs.

## Branches and releases

- Semantic Versioning; tags are `vX.Y.Z`.
- `master` is stable and only receives merges from release branches (and hotfixes).
- `development` is experimental; feature branches (`feature/<name>`) merge into it.
- Release: branch `release/vX.Y.Z` from `development` (frozen, bug fixes only), bump the version
  and update `CHANGELOG.md`, merge into `master`, tag `vX.Y.Z`, merge back into `development`.

## License

GPL-2.0-only, see [LICENSE](LICENSE). (The MySQL option bundles MariaDB, which is GPL-2.0.)
