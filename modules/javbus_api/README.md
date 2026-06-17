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
- Caching and request throttling are implemented in `client.py`.
- Default uncached request interval is `0.3` seconds. Override it with
  `javbus.request_interval_seconds` in `config.json` or
  `JAVBUS_REQUEST_INTERVAL_SECONDS`; set it to `0` to disable throttling.
