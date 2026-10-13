# Recording fixtures

`bun run record` listens to Zigbee2MQTT and asks the OpenThread Border Router's REST API for
everything it offers, and writes the answers to `recordings/<time>/`. The recordings become the
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
bun run record --minutes 60
```

Either variable alone records only that network. `Ctrl+C` stops early and keeps what was recorded.

| Option | Default | |
|---|---|---|
| `--minutes` | `60` | how long to record |
| `--out` | `recordings/<time>` | target folder |
| `--otbr-interval` | `15` | minutes between two OTBR rounds |
| `--no-networkmap` | off | do not request the Zigbee network map |
| `--no-otbr-actions` | off | only GET requests, no diagnostic tasks |
| `--energy-scan` | off | one energy scan over channels 11 to 26 at the start |

## What it sends

- **Zigbee2MQTT:** subscribes to `<base>/#` and publishes one request,
  `<base>/bridge/request/networkmap` with `{"type":"raw","routes":true}`. The scan puts load on the
  network for a while; `--no-networkmap` skips it.
- **OTBR:** GET on every `/node/*` resource, `/diagnostics`, `/.well-known/thread/br-rest` and
  `/api/{node,devices,diagnostics,actions}`. Where `/api/actions` exists it posts an
  `updateDeviceCollectionTask` and a `getNetworkDiagnosticTask` per device (neighbors, child
  table, link quality, counters). `--energy-scan` adds a `getEnergyScanTask`, which makes the border
  router act as commissioner for the scan.

Nothing changes the configuration of either system.

## What it writes

- `zigbee2mqtt.jsonl`: one line per message, `{ts, topic, retain, payload}`
- `otbr.jsonl`: one line per request, `{ts, method, path, request, status, contentType, body}`
- `meta.json`: start, end, options, counts

Network keys, PSKc, passwords and tokens are replaced with `[redacted]`, and the Thread dataset in
hex form is dropped. Device names, IEEE and extended addresses stay; look through the files before
sharing them if those are private.

## Hand it in

Copy the folder to `tests/fixtures/recordings/<zigbee2mqtt or otbr version>/` on the pull request
branch and commit it. After an update of Zigbee2MQTT or the OTBR image, record again and put the new
folder next to the old one, so both formats stay tested.
