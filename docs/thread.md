# Thread (OpenThread Border Router)

Funkloch reads the REST API of the OpenThread Border Router (ot-br-posix), usually on port 8081.
Set `OTBR_URL`, e.g. `http://localhost:8081`. Border routers of other makers (Apple, Google, Eve,
Aqara) have no such API; their Thread network shows up through [Matter](matter.md), whose devices
report their own neighbor tables.

## Newer images: `/api`

Images with the `/api` resources (ot-br-posix from 2024 on) give the most:

| Every | Request | For |
|---|---|---|
| 15 min | `updateDeviceCollectionTask`, then `GET /api/devices` | the devices: extended address, role and host name from SRP (the list carries no vendor or model) |
| 15 min | `GET /node/dataset/active` | the channel (only the channel is read, never the keys) |
| 5 min | `getNetworkDiagnosticTask` to each router (`routerNeighbors`, `children`, `macCounters`, `vendorName`, `vendorModel`, `threadStackVersion`) | one reading per device: RSSI and link margin as its parent or best neighbor hears it; each router's transmit counters and maker |
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

## The root of the map

The root is the border router Funkloch reads: the only item of type `threadBorderRouter` in
`/api/devices` (ot-br-posix `src/rest/rest_devices_coll.cpp`, *this* device), or the `/node` of older
images. Other border routers in the same network (an Apple TV, a HomePod, a Google TV Streamer)
and the leader of the partition, whoever it is, are routers on the map. That keeps the way to the
root, the router check and the bottlenecks about the border router your Home Assistant talks to:
a device whose best way leads to a streamer's border router may still reach yours through it, and
the map shows that step. Funkloch cannot read the other border routers' tables; their links come
from the routers that hear them.

## Names

The border router knows extended addresses and, with SRP, host names. A router's network
diagnostic can also name its maker and model (`vendorName`, `vendorModel`), if its firmware sets
them; OpenThread leaves both empty by default (`src/core/config/net_diag.h`), and a firmware such as
an ESP32-C6 router can set them with `otThreadSetVendorName` and `otThreadSetVendorModel`
(`OPENTHREAD_CONFIG_NET_DIAG_VENDOR_INFO_SET_API_ENABLE`).

Funkloch cleans both first: punctuation and spaces at the end go, and what is left under 3
characters counts as not set. OpenThread built as a reference device sends the vendor name `RD:`
(an ESP32-C6 with ESPHome's OpenThread does), which is therefore neither a maker nor a name. When
neither is set, the stack version may name the chip: `openthread-esp32/-; esp32c6; …` gives the
model *ESP32-C6 (OpenThread)*.

A router without a host name is named after its model (or maker) and its short address:
*ESP32-C6 (OpenThread) · 52bb…4b82* instead of *52bbac72ec804b82*; with neither, the address
stays. End devices are never asked, so they keep their address.

Give a device a name of its own with the pencil next to its name on its page, or for all devices
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
