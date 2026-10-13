# Development

Requires Bun 1.4 or newer.

```sh
git clone https://github.com/firsttris/funkloch && cd funkloch
bun install
bun run demo          # http://localhost:8090 with the demo network, no login
```

With your own network: `ZIGBEE2MQTT_MQTT_URL=… OTBR_URL=… bun run dev`.

## Stack

Bun, TanStack Start (React) with Router, Query and Table, Zod, SQLite (`bun:sqlite`) with Drizzle,
mqtt.js, Tailwind 4 with Radix and lucide, uPlot, d3-force for the map layout, Paraglide (German
and English), Biome, Vitest, Playwright. `bun run build` bundles everything into `dist/`; `serve.ts`
serves it with `Bun.serve`, so the image needs no `node_modules`. On SIGTERM or SIGINT it logs
`shutting down`, closes the HTTP server, stops the adapters and jobs, writes what is still buffered
and closes the database, then exits with 0; as PID 1 in a container it would otherwise ignore SIGTERM
and be killed after the grace period. A cycle against the border router that is still waiting is not
waited for.

## Architecture

```
src/adapters/   zigbee2mqtt (MQTT), otbr (REST): protocol → observations, score formula per protocol
src/core/       pure functions: score, reachability, rollups, trend, events, patterns, notify, layout
src/db/         Drizzle schema, migrations, storing observations, queries, jobs' database side
src/jobs/       the scheduler: reachability and signal every minute, rollup and trend hourly,
                retention and patterns at 3 a.m.
src/server/     runtime (adapters → ingest → database), auth, live updates (SSE), notifications,
                views (shape the pages' data), server functions
src/routes/     the pages and /healthz, /api/live, /api/events.csv
src/demo/       the demo network
```

The core knows no protocols: each adapter delivers devices, readings, availability, topologies and
channel scans as `Observation`s. A new network is a new adapter with its own `ProtocolMeta` (labels,
raw unit, score formula); nothing in the core changes. More in [CLAUDE.md](https://github.com/firsttris/funkloch/blob/main/CLAUDE.md).

## Checks

```sh
bun run typecheck                    # Paraglide compile + tsc --noEmit
bunx biome ci .
bun run test                         # unit, database, API and contract tests
bun run build
bun run e2e                          # Playwright against the demo and a server with login
MQTT_TEST_URL=mqtt://localhost:1883 bun run test:integration   # needs a broker
mkdocs build --strict                # when docs/ or mkdocs.yml changed
```

| Layer | Where | What |
|---|---|---|
| Unit | next to the code in `src/core`, `src/adapters` | formulas, parsing, decisions; property tests with fast-check |
| Database | `src/db/*.test.ts` | real SQLite files |
| API | `tests/api` | the pages' data from the seeded demo at a fixed time |
| Contract | `tests/contract` | every recorded Zigbee2MQTT message and OTBR answer passes the schemas |
| Integration | `tests/integration` | the Zigbee adapter and MQTT notifications against Mosquitto |
| E2E | `tests/e2e` | Chromium, Firefox and WebKit against the demo; login and settings; in CI in two halves at once |
| Container | CI, when `docker/`, `serve.ts`, the package files, `vite.config.ts` or the migrations change | the image starts on amd64 and arm64, each on its own runner, and `/healthz` turns green |

## Fixtures

Recordings from real networks keep the schemas honest: see [Recording fixtures](recording.md).

## Releases

**Actions → Bump version → Run workflow** raises the version and pushes the tag; the tag starts
**Release**: all checks, the image `tristanteu/funkloch` for amd64 and arm64 on Docker Hub, and
the GitHub release. The image is started in CI whenever what it is built from changes; its build
cache is the release's, so the release builds on layers that are already there. **Actions → Update screenshots** renews the pictures in
`docs/screenshots` from the demo.
