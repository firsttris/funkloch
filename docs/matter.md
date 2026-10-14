# Matter (matterjs-server)

Funkloch reads the WebSocket of [matterjs-server](https://github.com/matter-js/matterjs-server), the
Matter controller behind Home Assistant's Matter integration (it replaces the Python Matter Server,
which was archived in 2026). Set `MATTER_SERVER_URL`, e.g. `ws://localhost:5580/ws`.

What it adds:

- **Thread behind any border router.** Matter devices report their own neighbor table, so the mesh
  shows up with an Apple TV, a HomePod, a Google Nest or an Aqara hub as border router, where the
  [OTBR REST API](thread.md) is not available.
- **Wi-Fi devices.** Matter devices on Wi-Fi report the RSSI of their access point; they get a
  network of their own, **Wi-Fi**, with each access point as the root of its map.
- **Names, makers, battery and reachability** of every Matter device.

## What it reads

| When | Command | For |
|---|---|---|
| at connect | `start_listening` | every node with the attributes the server holds; then its events |
| every event | `node_added`, `node_updated`, `attribute_updated` | names, roles, battery, reachability; a report is a sign of life |
| every 15 min | `read_attribute` per awake node | Thread: neighbor table (`0/53/7`) and transmit counters; Wi-Fi: BSSID and RSSI (`0/54/0`, `0/54/4`) |
| every 15 min | `get_thread_border_routers` | the border routers the server found over mDNS: the root of the Thread map |

Devices report their neighbor table only when their subscription starts and their Wi-Fi RSSI never
by itself, so Funkloch reads them, one node after the other. A sleepy end device and a long idle
time device (ICD) are never read: a read would wait for them or cost battery. A value older than two
intervals, such as the table a sleeping device sent at its last start, counts for nothing. Change
the interval with `MATTER_POLL_MINUTES` (5 to 1440).

The battery level the server holds for a node is passed on at connect and with every poll, for
Thread and Wi-Fi alike and with the OTBR on too, so a device whose level does not change (and so
sends no report of it) still shows it. A level from the server's cache is no sign of life: it moves
neither the last message nor the reachability.

Funkloch never writes an attribute, invokes a command, commissions or sets credentials.

| Attribute | Path | Used as |
|---|---|---|
| BasicInformation NodeLabel, ProductName, VendorName | `0/40/5`, `0/40/3`, `0/40/1` | name (the label if the controller set one, else the product), model, maker |
| NetworkCommissioning FeatureMap | `0/49/65532` | Thread, Wi-Fi or neither (Ethernet devices are left out) |
| GeneralDiagnostics NetworkInterfaces | `0/51/0` | the address: Thread's extended address, as the OTBR reports it, or the Wi-Fi MAC |
| ThreadNetworkDiagnostics RoutingRole, Rloc16, Channel | `0/53/1`, `0/53/64`, `0/53/0` | role, short address, channel |
| ThreadNetworkDiagnostics NeighborTable | `0/53/7` | RSSI (average, else last) and link quality 0–3 per neighbor, children |
| ThreadNetworkDiagnostics TxUnicastCount, TxBroadcastCount, TxErrCcaCount | `0/53/23`, `0/53/24`, `0/53/36` | [transmit errors](thread.md#transmit-errors), where the device has the counters |
| WiFiNetworkDiagnostics Bssid, Rssi | `0/54/0`, `0/54/4` | the access point and the signal |
| NetworkCommissioning Networks | `0/49/1` | the SSID, to name the access point |
| PowerSource FeatureMap, BatPercentRemaining | `*/47/65532`, `*/47/12` | mains or battery, battery level (in half percent: 200 is 100 %) |
| ICD Management OperatingMode | `0/70/8` | long idle time devices, which are not read |

## Thread

A child is measured by how its parent hears it; where the parent cannot be read (a border router of
another maker), by how the child hears its parent. A router is measured by the best of the routers
that hear it. Border routers found over mDNS are the root of the map, named after their host name;
devices that are no node of this controller (a neighbor's device, a device of another controller)
show up through the tables that hear them. Routers get an uplink as with the OTBR, see
[Repeaters](repeaters.md). The score is the [Thread score](thread.md#score).

## Together with the OTBR

With `OTBR_URL` set as well, the border router measures and maps Thread, as before, and Matter
describes the devices: names, makers and models, mains or battery, battery level and reachability
come from Matter, role and short address from the border router. Both name one device by its
extended address, so it is one device in Funkloch. The map stays the border router's view of the
mesh; Wi-Fi comes from Matter either way.

## Wi-Fi

A station hangs on the access point (BSSID) it is connected to; the access point is named after the
SSID and the end of its BSSID, e.g. *Heimnetz · 22:33*, since a mesh has one BSSID per radio. The
score is the RSSI linear between −90 dBm (0) and −50 dBm (100): with the default thresholds a
signal is good from about −66 dBm and weak below −80 dBm.

## Reachability

matterjs-server says whether each node is reachable (its subscription is alive). A node it reports
unavailable is offline at once; otherwise the [usual silence rule](signal.md#reachability) applies.
When the connection to the server drops, the networks it delivers report their bridge offline, and
Funkloch connects again after 5 seconds, then up to once a minute.

## Versions

Funkloch needs a server that speaks WebSocket schema 11 or newer;
it logs the schema and server version it found at connect (`matterjs-server connected`).
