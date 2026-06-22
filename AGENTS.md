# AGENTS.md

## Role

This file is the repository entry contract for AI and human contributors.

Use it as:

- the first file to read before coding
- the architecture boundary definition
- the documentation garbage-collection checklist

If code, docs, or instructions conflict with this file, stop and resolve the conflict before continuing.

## Product Definition

JavJaeger is a full-spectrum JAV automation tool for JAV enthusiasts, geeks, and programmers. It may automate discovery, metadata enrichment, magnet selection, cloud dispatch, WebDAV browsing, Aria2 handoff, and local library workflows, but product growth must not weaken the existing module boundaries or security model.

## Engineering Mode

This repository uses Harness Engineering and strict TDD.

Harness Engineering means meaningful behavior is protected by executable tests, fixtures, fakes, or build checks before it is treated as done. Prefer small, focused tests over broad manual verification.

Strict TDD means:

- Red: write or update the smallest failing test first.
- Green: change production code only enough to pass.
- Refactor: clean up while keeping the harness green.
- Guard: run the focused harness and then the project-level validation for the changed surface.

Bug fixes require a regression test. New features require contract or workflow tests before implementation. Documentation-only and mechanical formatting changes do not need a failing test.

## Mandatory Read Order

Read these before changing code:

1. `readme.md`
2. `main.py`
3. `modules/common/runtime.py`
4. the router and service in the module you are touching
5. `frontend/src/main.jsx`
6. `frontend/src/components/JavPage.jsx` or `frontend/src/components/WebDavPage.jsx`
7. `templates/index.html`

If the task affects runtime, deploy, or dependencies, also read:

- `requirements.txt`
- `package.json`
- `docker-compose.yml`
- `Dockerfile`
- `DOCKER.md`

## Ownership Map

Use this as the source-of-truth ownership map.

- `main.py`
  - app assembly only
  - middleware
  - static mount
  - router registration
  - startup and shutdown hooks
- `modules/common/`
  - shared runtime utilities
  - config
  - version info
- `modules/javbus_api/`
  - in-process JavBus API-compatible provider
  - JavBus HTTP client
  - JavBus HTML parsing
  - JavBus response schema aligned with `ovnrain/javbus-api`
  - JavBus cache and request throttling
- `modules/ui/`
  - HTML shell routes
- `modules/system/`
  - diagnostics and system info APIs
- `modules/history/`
  - download history persistence and APIs
  - local movie library persistence used to avoid duplicate downloads
  - actor information library persistence and local actor avatar index
  - scraped local movie metadata and full-text persistence
- `modules/movies/`
  - movie list/detail/batch/recognition workflows
- `modules/magnets/`
  - magnet lookup and selection policy
- `modules/pikpak/`
  - PikPak login and download dispatch
- `modules/pan115/`
  - 115 QR/Cookie login
  - 115 Cookie-based offline download dispatch
  - 115 direct download URL resolution for server-side Aria2 dispatch
- `modules/webdav/`
  - WebDAV browsing
  - Aria2 dispatch
  - session-scoped downloader state
- `modules/automation/`
  - saved automation task persistence
  - trigger scheduling
  - movie discovery orchestration
  - magnet selection orchestration
  - PikPak or Aria2 download dispatch orchestration
- `modules/proxy/`
  - final catch-all API route
  - explicit 404 for unknown API paths
- `frontend/src/`
  - editable frontend source
- `static/app.js`
  - generated frontend bundle
  - never hand-edit
- `static/`
  - static assets and generated output
- `templates/`
  - HTML shell only
- `docs/`
  - engineering process
  - contributor-facing architecture notes
- `tests/`
  - executable harnesses
  - contract, unit, and integration tests
- `archive/`
  - historical reference only
  - not runtime code
- `data/`
  - runtime state
  - not source code

## Hard Rules

### 1. Keep `main.py` thin

Allowed in `main.py`:

- app creation
- middleware registration
- mount and router wiring
- startup and shutdown hooks

Forbidden in `main.py`:

- business workflows
- parsing logic
- downloader logic
- large request handlers
- shared helper blocks

### 2. Keep router and service roles separate

Router responsibilities:

- receive HTTP input
- call services
- shape HTTP responses

Service responsibilities:

- own business logic
- orchestrate workflows
- call shared clients or other approved services

Do not move non-trivial domain logic into routers.

### 3. Put shared runtime concerns in `modules/common/`

If multiple modules need the same runtime concern, move it into `modules/common/`.

Examples:

- config loading
- version resolution
- shared clients
- cache primitives
- throttling

Do not duplicate cross-cutting helpers across feature modules.

### 4. WebDAV and Aria2 state must stay session-scoped

Required:

- downloader connection state belongs to a browser session
- one session must not overwrite another session’s downloader state
- WebDAV credentials must not be embedded into final download URLs

Forbidden:

- process-global `webdav_client`
- process-global `aria2_client`
- `username:password@host` URL generation

### 5. Sensitive values must not be long-term persisted by default

Required:

- keep short-lived browser secrets in session storage when possible
- keep long-lived local storage limited to non-sensitive convenience fields
- avoid secret leakage in logs and responses

Forbidden:

- embedding secrets into URLs
- persisting new secrets to long-term browser storage by default
- echoing secrets in logs, errors, or API payloads

### 6. Frontend source and bundle are separate artifacts

Source of truth:

- `frontend/src/**`

Generated output:

- `static/app.js`

Required:

- edit frontend code only in `frontend/src/**`
- rebuild the bundle after frontend source changes

Forbidden:

- hand-editing `static/app.js`
- adding browser-side Babel entrypoints
- moving app logic into `templates/index.html`

### 7. `templates/index.html` is a shell only

Allowed:

- CDN includes
- root container
- version injection
- generated bundle include

Forbidden:

- feature logic
- page state
- duplicate frontend rendering paths

### 8. `archive/` is read-only by default

Forbidden:

- wiring archived code back into runtime
- copying archived files into active runtime paths without review
- treating archive as a second active codebase

### 9. Keep the proxy router last

`/api/{path:path}` is a catch-all proxy.

Required:

- register concrete API routers before the proxy router

Forbidden:

- adding ambiguous GET routes under `/api/` after the proxy router

### 10. Do not use runtime artifacts as design inputs

Do not derive architecture from:

- `data/`
- logs
- generated bundle output
- temporary runtime files

Use source code and declared module boundaries instead.

## Dependency Rules

Allowed:

- `main.py` -> router modules
- router -> same-module service or schema
- service -> `modules/common/*`
- service -> another domain service only when the dependency is explicit and one-directional
- frontend components -> frontend utils and components

Forbidden:

- service -> `main.py`
- `modules/common/*` -> feature modules
- router -> unrelated feature router
- frontend source -> `static/app.js`
- active runtime code -> `archive/*`
- tests -> `data/` runtime state

Current approved backend cross-module dependencies:

- `movies` -> `magnets`, `history`
- `movies` -> `javbus_api`
- `magnets` -> `javbus_api`, `movies`
- `history` -> `javbus_api`
- `system` -> `javbus_api`
- `pikpak` -> `history`
- `pan115` -> `history`
- `pan115` -> `common`
- `webdav` -> `pan115`
- `automation` -> `javbus_api`, `movies`, `magnets`, `pikpak`, `pan115`, `webdav`, `history`

If a new module is needed, define its ownership and allowed imports before writing code.

## Change Rules

Preferred:

- extend an existing module that already owns the concern
- move repeated logic into shared utilities
- delete obsolete paths after replacement is complete

Forbidden:

- parallel implementations of the same workflow
- half-migrated runtime paths
- copy-pasted business logic across modules
- reviving removed legacy frontend entrypoints

## Garbage Collection Rules

Documentation and knowledge garbage collection is mandatory.

Trigger garbage collection whenever any of these change:

- directory structure
- route layout
- module boundaries
- build steps
- security model
- session model
- runtime entrypoints
- public API contracts
- archive status of old code

When triggered, review for staleness:

- `AGENTS.md`
- `readme.md`
- `templates/index.html` assumptions
- `requirements.txt`
- `package.json`
- `DOCKER.md`
- any touched comments or module-level docs

Treat these as garbage and remove or update them:

- outdated paths
- deleted entrypoints still mentioned as active
- old build instructions
- comments describing removed behavior
- duplicated guidance in multiple places
- legacy workflows presented as current workflows

AI may automatically:

- update stale paths
- remove references to deleted entrypoints
- update setup instructions to match the real runtime
- tighten architecture text after refactors
- remove misleading comments

AI must not automatically:

- rewrite ambiguous historical notes
- delete large docs without clear evidence they are obsolete
- invent rules not grounded in the current repository

## Required Self-Check Before Finishing

For every non-trivial change, check all of these:

1. I edited the source of truth, not generated or archived output.
2. I did not create duplicate logic where an existing module should be extended.
3. I preserved the router/service split.
4. I did not reintroduce process-global mutable session state.
5. I did not leak secrets into URLs, logs, local storage, or API payloads.
6. If frontend source changed, I rebuilt `static/app.js`.
7. If I added a route, it is safe relative to the proxy catch-all route.
8. If I added a dependency, it follows the allowed dependency direction.
9. I did not accidentally treat `archive/`, `data/`, or logs as active source code.
10. I removed or updated stale docs, comments, and setup instructions caused by my change.
11. `AGENTS.md` still matches the actual repository structure after my change.

## Validation Minimum

Backend changes:

- Python syntax check
- `main.py` import/load check
- route registration spot-check
- relevant `python -m pytest` harness

Frontend changes:

- frontend bundle rebuild
- confirm `templates/index.html` still loads `static/app.js`

Security or workflow changes:

- verify secrets are not embedded into URL-building logic
- verify session-scoped state still behaves per session

## Stop and Ask When

Stop instead of guessing if:

- a change merges responsibilities across module boundaries
- a new module boundary is needed
- a secret must be persisted long-term
- the shortcut requires editing generated files instead of source
- the proposed change conflicts with this file

Keep this file short, operational, and aligned with the live codebase.
