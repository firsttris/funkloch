# Notes for Claude

## Documentation

The documentation is in `docs/` (<https://firsttris.github.io/funkloch/>, MkDocs Material follows
with release 1.0). Read the pages that touch the change before starting:
[docs/recording.md](docs/recording.md) for the fixture recorder. The implementation plan (architecture, data model, score
formulas, roadmap) is the Claude Docs page "Funkloch – Implementierungsplan"; ask for it when a
detail is not settled here. Links in the README point to the GitHub Pages site, not to `docs/*.md`.

## Reference implementations

Base details on the sources, not on memory. Clone them shallowly (`git clone --depth 1`) into the
scratchpad and name the source file in comments and commit messages where it settles a detail:

- **Zigbee2MQTT** (`Koenkk/zigbee2mqtt`): `lib/types/api.ts` for every payload,
  `lib/extension/bridge.ts` (`bridge/devices`), `lib/extension/availability.ts`,
  `lib/extension/networkMap.ts` (raw map, neighbor `relationship` 0 parent / 1 child / 2 sibling).
- **OpenThread Border Router** (`openthread/ot-br-posix`): `src/rest/openapi.yaml` and
  `src/rest/rest_web_server.cpp` for the REST resources; `src/rest/diagnostic_types.hpp` for the
  diagnostic TLV names. There is no `/node/neighbors`; neighbors come from
  `getNetworkDiagnosticTask` via `/api/actions`. Older images (Home Assistant add-on) only have
  `/node/*` and `/diagnostics`. The OTBR schemas follow the recorded answers in
  `tests/fixtures/recordings/`, not the spec alone.

## With every change

Update what the change affects, in the same commit, and only that:

- the tests for what changed: unit tests next to the code in `src/core` and `src/adapters`,
  database tests in `src/db` (real SQLite files), contract tests replay `tests/fixtures/recordings`,
  integration tests in `tests/integration` (need a broker), E2E in `tests/e2e` (demo mode);
- the docs in `docs/` that describe it;
- the texts in both `messages/de.json` and `messages/en.json`;
- the README when a feature a user sees is added, changed or removed;
- the screenshots after a change to the look: **Actions → Update screenshots → Run workflow**, then
  look at the new pictures.

## Checks

Green before every push, then check CI:

```sh
bun run typecheck                    # paraglide compile + tsc --noEmit
bunx biome ci .
bun run test                         # unit, contract and database tests (Vitest under Bun)
bun run build
bun run e2e                          # Playwright, demo mode; needs the build
MQTT_TEST_URL=mqtt://localhost:1883 bun run test:integration   # with a broker at hand
```

Outside the Playwright image, point Playwright at a local Chromium with
`PLAYWRIGHT_CHROMIUM_PATH`.

## Pull requests

- Work happens directly on `main`, in small commits; no pull requests unless asked.
- Force-push: never on `main`.

## Working rules

- Commands as root (`sudo`, `pkexec`) are run by the user; don't work around that.
- The user's running processes are not stopped; use other ports for tests (the app defaults to
  8090, Playwright uses 8099).
- Language: code, comments, docs, commits in English; the app's interface in German and English.
- Funkloch only reads: it never switches devices, pairs or changes Zigbee2MQTT or OTBR
  configuration. The only requests it sends are the network map (at most hourly, default 6 h) and
  OTBR diagnostics.

## Code style

Technology choices follow `tech-stack.md` in firsttris/workflows. Deviations and additions:

- **d3-force** for the network map (phase 2): `tech-stack.md` names nothing for graph layout.
  d3-force only computes positions, is small and leaves the drawing to our own SVG, in line with
  the rule against big visualization libraries.
- **No Nitro**: `serve.ts` serves the Vite build with `Bun.serve`. Funkloch is one long-running
  process that holds the MQTT connection and the jobs; the server bundle is self-contained
  (`ssr.noExternal`), so the image needs no `node_modules`.
- **@fontsource-variable/geist** and **geist-mono**: the mockup's typefaces, served from the app
  instead of Google Fonts, so a self-hosted install makes no outside requests.
- **@tanstack/react-router-ssr-query**: hands the TanStack Query data loaded during SSR to the
  client; without it the client refetches and hydration renders different values.

Architecture rules:

- Logic lives in pure functions in `src/core`, without a framework, with unit tests. Server
  functions (`src/server/api.ts`) are thin adapters: fetch with `src/db/queries.ts`, shape with
  `src/core`.
- The core knows no protocols. Each adapter (`src/adapters/zigbee2mqtt`, `src/adapters/otbr`)
  delivers devices, measurements and links as `Observation`s, and owns its score formula
  (`meta.ts`, built from `linearScore` in the core) and its raw-value display.
- An adapter is on when its environment variable is set (`ZIGBEE2MQTT_MQTT_URL`, `OTBR_URL`).
- Zod at every boundary: environment (`src/config.ts`), MQTT payloads, OTBR answers, server
  function input, search params.
- Server-only modules start with `import '@tanstack/react-start/server-only'`; a server function
  file must not export plain functions that pull database code into the client bundle.

Clean Code, written functionally: clear names, small functions that do one thing, dependencies
passed in, no duplication or dead code, comments that say why; the ideas behind SOLID and the
design patterns are welcome as functions, data and closures, but not as classes, inheritance or
class hierarchies.

Functional, not object-oriented: pure functions that take data and return data, side effects at
the edges; function components and hooks, no classes; errors as values. A file does one thing:
split it past ~400 lines, a function past ~80. A refactor changes no behaviour.

## Project specifics

- `FUNKLOCH_DEMO=1` starts with the mockup's devices (`src/demo`), 30 days of history seeded into
  a fresh `demo.db` on every start; deterministic for a given time and time zone. Playwright and
  the screenshots run against it with `TZ=Europe/Berlin`.
- Timestamps are milliseconds everywhere; uPlot gets seconds.
- Score 0–100 for the traffic light and the heatmap; charts show the protocol's raw value (LQI for
  Zigbee, RSSI for Thread), which is why `hourly` keeps raw median, min and max as well.
- Traffic light and trend run on hourly medians (the last 60 minutes for the current status),
  never on single readings.
- Fixtures: `bun run record` on the user's server (see `docs/recording.md`); recordings go to
  `tests/fixtures/recordings/<version>/` next to older ones, never over them.
