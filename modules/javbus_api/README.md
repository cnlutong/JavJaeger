# JavBus API provider

This module is the in-process JavBus API provider used by JavJaeger.

It intentionally mirrors the public contract of `ovnrain/javbus-api` instead of
adapting data into a separate JavJaeger schema. Keep response fields aligned with
the upstream API, especially:

- movie image field: `img`
- magnet date field: `shareDate`
- magnet size fields: `size` and `numberSize`
- detail parameters required for magnets: `gid` and `uc`

Upstream sync target:

- Repository: https://github.com/ovnrain/javbus-api
- Last reviewed release: 2.1.5
- Source files to compare first: `api/client.ts`, `api/javbus-parser.ts`, `api/router.ts`

Local differences:

- Implemented in Python/FastAPI stack.
- `imageSize` is currently returned as `None`; JavJaeger does not depend on it.
- HTML caching, concurrent request coalescing and request throttling are implemented in `client.py`.
- `metadata_cache.py` persists the shared retention policy in
  `data/movie_metadata_cache.json` and parsed public details in the adjacent
  `data/movie_metadata_cache.json.entries/` directory. Legacy single-file snapshots
  migrate on the first write, with the settings file committed after all entries.
  A normal update atomically replaces one hashed movie JSON file. Details are reused across devices and
  restarts. `GET /api/metadata-cache` returns `settings`, `count` and `size_bytes`;
  `PUT /api/metadata-cache` accepts `{ "mode": "days" | "size", "days": positive_integer,
  "mb": positive_integer }` and immediately prunes the cache. Size mode counts the
  actual UTF-8 bytes of the settings and entry files. Cache I/O failures do not prevent
  live detail retrieval; settings errors are reported to the caller.
- Default uncached request interval is `0.5` seconds. Override it with
  `javbus.request_interval_seconds` in `config.json` or
  `JAVBUS_REQUEST_INTERVAL_SECONDS`; set it to `0` to disable throttling.
