# Events and notifications

## Events

Funkloch writes an event when something changes; the **Events** page lists them by day, filters
them by kind and exports them as CSV (`/api/events.csv`). The page shows the newest 1000 events
of the range and says so when there are more; the CSV has them all.

| Kind | Events |
|---|---|
| Offline | **offline** (reported or silent), **back online** |
| Signal | **below threshold** (median below *weak* for 30 minutes, back above it 5 points higher), **falling trend**, **recurring pattern**, **many transmit errors** (a Thread router fails 5 % of its frames over 24 hours, back to normal below 3 %) |
| Topology | **parent changed**, **role changed** (e.g. a Thread router became a child) |
| Network | **joined**, **removed**, **bridge offline** and **back** (Zigbee2MQTT, the border router or matterjs-server), **channel noisy** (an energy scan finds a network's own channel above −76 dBm) |

## Rules

Under **Events → Notifications** each kind can be switched on or off:

| Rule | Default | |
|---|---|---|
| Device offline | on, after 60 minutes | a device back within the wait sends nothing; *back online* only follows a sent *offline* |
| Signal below threshold | on, after 30 minutes | *recovered* only follows a sent *below threshold* |
| Trend falling | on | |
| Recurring pattern | on | |
| Transmit errors | on | *back to normal* only follows a sent *many transmit errors* |
| Parent or role change | off | frequent in a healthy mesh |
| Network | on | joined, removed, bridge, noisy channel |

The same event of the same device is sent at most once an hour. Events older than 6 hours are not
sent any more, so a restart or a newly set up channel does not flood you. Every event shows
whether it was sent, skipped or failed.

Set **Address of this Funkloch** (e.g. `https://funkloch.example.com`) so each message links to the
device. The language of the messages is set there too.

## Channels

All channels that are set up receive every notification. **Send test message** checks them.

### ntfy

Server (default `https://ntfy.sh`), topic and, for a protected topic, an access token. Offline,
weak signal and bridge offline go with high priority; the message links to the device.

### Webhook

A `POST` with `Content-Type: application/json` to the URL:

```json
{
  "id": 412,
  "time": "2026-10-13T06:12:00.000Z",
  "kind": "offline",
  "type": "offline",
  "protocol": "zigbee",
  "device": { "id": 7, "name": "Türsensor Garage", "address": "0x00158d0005a1b201" },
  "details": { "reason": "silent", "lastSeen": 1791869520000 },
  "title": "Offline: Türsensor Garage",
  "message": "silent for longer than usual",
  "url": "https://funkloch.example.com/devices/7"
}
```

`device` is `null` for events without a device (bridge, channel); `url` is `null` without a public
address.

### MQTT

The same JSON to a topic on the Zigbee2MQTT broker (default `funkloch/events`, QoS 1), for
automations in Home Assistant, Node-RED or ioBroker. Needs `ZIGBEE2MQTT_MQTT_URL`.
