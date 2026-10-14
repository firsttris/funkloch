# Thread (OpenThread Border Router)

Funkloch reads the REST API of the OpenThread Border Router (ot-br-posix), usually on port 8081.
Set `OTBR_URL`, e.g. `http://localhost:8081`. Border routers of other makers (Apple, Google, Eve)
have no such API.

## Newer images: `/api`

Images with the `/api` resources (ot-br-posix from 2024 on) give the most:

| Every | Request | For |
|---|---|---|
| 15 min | `updateDeviceCollectionTask`, then `GET /api/devices` | the devices: extended address, role and host name from SRP (the list carries no vendor or model) |
| 15 min | `GET /node/dataset/active` | the channel (only the channel is read, never the keys) |
| 5 min | `getNetworkDiagnosticTask` to each router (`routerNeighbors`, `children`, `macCounters`) | one reading per device: RSSI and link margin as its parent or best neighbor hears it; each router's transmit counters |
| 1 h | the same diagnostics | the mesh for the network map |
| 6 h | `getEnergyScanTask` to the border router | energy per channel 11–26 for the 2.4 GHz card |

The tasks go to `/api/actions`; the answers are read from `/api/diagnostics`. The border router
accepts only a single media type in the `Accept` header (a list or a `q` parameter gets HTTP 406), so
Funkloch sends `application/vnd.api+json` to `/api/*` and `application/json` to `/node/*`. The energy scan
asks for one measurement per channel (`count` 1, `period` and `scanDuration` 100 ms each); the border
router refuses the task without them (HTTP 422). It runs one diagnostic request at a time, so Funkloch
waits for each router's answer in turn. A link whose average RSSI
OpenThread marks as unknown (127, no frame averaged yet) uses the last RSSI, or gives no reading. Sleepy end devices
are never asked; their parent's child table carries their link.

## Older images: `/diagnostics`

Images without `/api` (for example the Home Assistant add-on before 2024) only offer `/node` and
`/diagnostics`. Funkloch then shows the devices, their roles and the links between routers with
their link quality 0–3, but no RSSI: these devices have no signal chart, and their traffic light
stays *unknown*. Funkloch logs which API it found at start (`otbr REST API found`).

## Roles

A full Thread device that is still a child shows as *router-eligible (REED)*; when Thread makes it a
router, Funkloch reports the role change. Routers get an uplink towards the border router on the
map, see [Repeaters](repeaters.md).

## Names

The border router knows extended addresses and, with SRP, host names. Give each device a name
under **Settings → Device names**; Funkloch keeps it across restarts and re-joins.

## Score

The Thread score uses the RSSI (−100 dBm → 0, −50 dBm → 100) and is capped by the link quality
derived from the link margin (3 → 100, 2 → 59, 1 → 24, 0 → 0), so a strong but unreliable link does
not look good. Details: [Signal, trend and reachability](signal.md).

## Transmit errors

A router's MAC counters say how many of its frames found the channel busy. Funkloch shows the rate
on the router's page and reports it from 5 % over 24 hours: see
[Signal, trend and reachability](signal.md#transmit-errors-thread-routers). Older images without
`/api` give no counters.

## Device lists are never complete

A Thread device that does not answer drops out of the border router's collection. Funkloch does
not take that as *removed*: the device turns offline through its silence, and comes back when it
answers again.
