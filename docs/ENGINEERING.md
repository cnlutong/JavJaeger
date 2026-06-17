# Engineering Mode

JavJaeger is now defined as a full-spectrum JAV automation tool for JAV enthusiasts, geeks, and programmers. The product may automate discovery, metadata enrichment, magnet selection, cloud dispatch, WebDAV browsing, Aria2 handoff, local library indexing, and future power-user workflows, but each feature must be introduced through executable harnesses instead of informal manual checks.

## Harness Engineering

Harness Engineering means every meaningful change is protected by a small, repeatable verification surface before it becomes product code.

Required harness layers:

- Contract tests for module boundaries, route registration, API payload shape, and security invariants.
- Unit tests for parsing, selection policy, config merging, and pure workflow decisions.
- Service tests with fakes for external systems such as JavBus, PikPak, WebDAV, and Aria2.
- Integration tests for FastAPI route behavior when a route contract changes.
- Build checks for frontend changes, because `frontend/src/**` is the source of truth and `static/app.js` is generated.

Harnesses must avoid network access by default. Use fixtures, local sample payloads, and fakes for upstream services. A test may touch `data/` only through a temporary directory owned by the test run.

## Strict TDD

Use this loop for all non-trivial work:

1. Red: write or update the smallest failing test that describes the intended behavior.
2. Green: change production code only enough to pass the test.
3. Refactor: simplify while keeping the harness green.
4. Guard: run the relevant focused tests, then the project check before finishing.

Feature changes without a failing test first are not acceptable unless the change is pure documentation, formatting, or a mechanical dependency update. Bug fixes must include a regression test that fails on the old behavior.

## Current Harness Commands

```bash
python -m pytest
npm run build:frontend
npm run check
```

`npm run check` rebuilds the frontend bundle and runs the backend harness. Backend-only changes may use `python -m pytest` during the red/green loop, but final validation should match the changed surface.

## Baseline Contracts

The current baseline tests protect these non-feature requirements:

- `main.py` keeps concrete API routers before the `/api/{path:path}` proxy catch-all.
- Browser-visible client config does not expose WebDAV passwords, Aria2 secrets, or PikPak passwords.
- WebDAV download URLs do not embed `username:password@host`; credentials are passed through downloader options instead.
- WebDAV and Aria2 state remains session-scoped.

Add new baseline contracts whenever project architecture, security model, route layout, or workflow ownership changes.

## Test Data Rules

- Store reusable samples under `tests/fixtures/`.
- Do not read real runtime state from `data/`.
- Do not use files under `archive/` as active fixtures unless the test name explicitly documents historical compatibility.
- Never commit real credentials, cookies, tokens, or private download URLs.

