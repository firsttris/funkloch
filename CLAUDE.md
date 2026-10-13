# Notes for Claude

## Documentation

The documentation is in `docs/` (<https://firsttris.github.io/funkloch/>, MkDocs Material, built
and published by `.github/workflows/docs.yml`). Read the pages that touch the change before
starting: [installation](docs/installation.md) (variables, proxy, password reset),
[zigbee2mqtt](docs/zigbee2mqtt.md) and [thread](docs/thread.md) (what each adapter reads and
sends), [signal](docs/signal.md) (score, traffic light, trend, reachability, patterns),
[notifications](docs/notifications.md) (events, rules, payload),
[development](docs/development.md) (architecture, test layers, releases) and
[recording](docs/recording.md) (fixture recorder). The implementation plan (architecture, data model, score
formulas, roadmap) is the Claude Docs page "Funkloch – Implementierungsplan"
(<https://claude.ai/code/artifact/179f31f8-d644-46ab-9c72-2a9d550dc5b5>), the mockup of every page
is <https://claude.ai/artifact/1pij6DRM1RCDewuDfF9HMp>; ask for them when a detail is not settled
here. Links in the README point to the GitHub Pages site, not to `docs/*.md`.

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
mkdocs build --strict                # when docs/ or mkdocs.yml changed
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

- **The network map lays itself out** (`src/core/map-tree.ts`, a tree in the manner of the UniFi
  topology): no graph library, in line with the rule against big visualization libraries.
- **No Nitro**: `serve.ts` serves the Vite build with `Bun.serve`. Funkloch is one long-running
  process that holds the MQTT connection and the jobs; the server bundle is self-contained
  (`ssr.noExternal`), so the image needs no `node_modules`.
- **@fontsource-variable/geist** and **geist-mono**: the mockup's typefaces, served from the app
  instead of Google Fonts, so a self-hosted install makes no outside requests.
- **@tanstack/react-router-ssr-query**: hands the TanStack Query data loaded during SSR to the
  client; without it the client refetches and hydration renders different values.

Architecture rules:

- Logic lives in pure functions in `src/core`, without a framework, with unit tests. Server
  functions (`src/server/fn/*`) are thin adapters: views in `src/server/views` fetch with
  `src/db/queries.ts` and shape with `src/core`; `tests/api` checks the views against the demo.
- The core knows no protocols. Each adapter (`src/adapters/zigbee2mqtt`, `src/adapters/otbr`)
  delivers devices, measurements, links and channel scans as `Observation`s (a device list says
  whether it is complete; Thread's never is), and owns its score formula
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
- Login: one admin password (argon2id), set at `/setup` on the first visit; `handleAuth` in
  `src/server.ts` runs before the app, checks the session cookie and refuses cross-site writes.
  The demo has no login. `FUNKLOCH_RESET_PASSWORD=1` forgets the password at start.
- Notifications: events get a `delivery` state; `decide()` in `src/core/notify.ts` holds the rules,
  `src/server/notify` the channels (ntfy, webhook, MQTT on the Zigbee2MQTT broker).
- The demo must not depend on the hour it starts at beyond what the story needs (the terrace socket
  is weak in the evening); after changing `src/demo`, seed it at many start times and compare the
  events.
- The OTBR schemas and `tests/fixtures/otbr-spec` follow the spec until recordings from a real
  border router arrive; then the recordings decide.
- Routers have no parent in either protocol; `withUplinks` (`src/core/uplinks.ts`) marks each one's
  best neighbor one hop closer to the root as its parent, so the map, "connected through" and hops
  work for routers too. Zigbee routers that send nothing themselves get their uplink LQI as a
  reading (`source: 'networkmap'`).
- Fixtures: `bun run record` on the user's server (see `docs/recording.md`); recordings go to
  `tests/fixtures/recordings/<version>/` next to older ones, never over them.
