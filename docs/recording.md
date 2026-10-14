# Recording fixtures

`bun run record` listens to Zigbee2MQTT and matterjs-server and asks the OpenThread Border
Router's REST API for everything it offers, and writes the answers to `recordings/<time>/`. The recordings become the
fixtures the contract tests check the Zod schemas against (`tests/fixtures/`), and they decide which
OTBR endpoints the Thread adapter uses.

## Run it

On the machine that reaches the MQTT broker and the OTBR (Bun 1.4 or newer):

```sh
git clone https://github.com/firsttris/funkloch && cd funkloch
bun install
ZIGBEE2MQTT_MQTT_URL=mqtt://localhost:1883 \
ZIGBEE2MQTT_MQTT_USER=… ZIGBEE2MQTT_MQTT_PASSWORD=… \
OTBR_URL=http://localhost:8081 \
MATTER_SERVER_URL=ws://localhost:5580/ws \
bun run record --minutes 60
```

Each variable alone records only that system. `Ctrl+C` stops early and keeps what was recorded.

| Option | Default | |
|---|---|---|
| `--minutes` | `60` | how long to record |
| `--out` | `recordings/<time>` | target folder |
| `--otbr-interval` | `15` | minutes between two OTBR rounds |
| `--no-networkmap` | off | do not request the Zigbee network map |
| `--no-otbr-actions` | off | only GET requests, no diagnostic tasks |
| `--energy-scan` | off | one energy scan over channels 11 to 26 at the start |
| `--matter-interval` | `15` | minutes between two rounds of Matter attribute reads |
| `--no-matter-reads` | off | only listen to matterjs-server, read no attributes |

## What it sends

- **Zigbee2MQTT:** subscribes to `<base>/#` and publishes one request,
  `<base>/bridge/request/networkmap` with `{"type":"raw","routes":true}`. The scan puts load on the
  network for a while; `--no-networkmap` skips it.
- **OTBR:** GET on every `/node/*` resource, `/diagnostics`, `/.well-known/thread/br-rest` and
  `/api/{node,devices,diagnostics,actions}`. Where `/api/actions` exists it posts an
  `updateDeviceCollectionTask` and a `getNetworkDiagnosticTask` per device (neighbors, child
  table, link quality, counters). `--energy-scan` adds a `getEnergyScanTask`, which makes the border
  router act as commissioner for the scan.
- **matterjs-server:** `start_listening` (every node with its attributes, then the events),
  `get_thread_border_routers` and, every 15 minutes, `read_attribute` of what the Matter adapter
  reads itself: the neighbor table and transmit counters of awake Thread devices, BSSID and RSSI of
  Wi-Fi devices. `--no-matter-reads` leaves the reads out.

Nothing changes the configuration of either system.

## What it writes

- `zigbee2mqtt.jsonl`: one line per message, `{ts, topic, retain, payload}`
- `otbr.jsonl`: one line per request, `{ts, method, path, request, status, contentType, body}`
- `matter.jsonl`: one line per WebSocket message, `{ts, direction, message}`; `message` is the wire
  text, so 64-bit numbers stay exact
- `meta.json`: start, end, options, counts

Network keys, PSKc, passwords and tokens are replaced with `[redacted]`, and the Thread dataset in
hex form is dropped. Of Matter devices the serial number, the unique id and the fabric certificates
are replaced too. Device names, IEEE and extended addresses stay; look through the files before
sharing them if those are private.

## Hand it in

Copy the folder to `tests/fixtures/recordings/<zigbee2mqtt, otbr or matterjs-server version>/` on the pull request
branch and commit it. After an update of Zigbee2MQTT, the OTBR image or matterjs-server, record again and put the new
folder next to the old one, so both formats stay tested.
