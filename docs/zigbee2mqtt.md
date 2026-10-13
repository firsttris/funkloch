# Zigbee2MQTT

Funkloch reads Zigbee2MQTT over its MQTT broker. Set `ZIGBEE2MQTT_MQTT_URL` (and the login, if the
broker has one); Zigbee2MQTT 1.x and 2.x both work.

## What Funkloch reads

It subscribes to `<base topic>/#` and uses:

| Topic | For |
|---|---|
| `bridge/devices` | the device list: name, role (coordinator, router, end device), model, vendor, power source; a device missing from it is reported as removed |
| `bridge/state` | whether Zigbee2MQTT runs (*bridge offline* and *back* events) |
| `bridge/info` | the channel of the network, for the energy scan card |
| `<device>` | every state message with `linkquality`: one reading (LQI 0–255) |
| `<device>/availability` | online or offline as Zigbee2MQTT sees it |
| `bridge/response/networkmap` | the mesh: who is whose parent, LQI per link, and a reading for routers that send nothing themselves |

A message without `linkquality` still counts as a sign of life. Retained messages the broker
replays at connect time are not readings.

## What Funkloch sends

One request only: `bridge/request/networkmap` with `{"type":"raw","routes":false}`, five minutes
after the start and then every 6 hours (**Settings → Network map every**, at least 1 hour, or
**Network map → Request a map now**). The scan asks every router for its neighbor table and puts load on the
network for a while, so keep the interval generous.

Funkloch never switches, pairs, renames or reconfigures devices.

## Tips

- **Availability**: turn on `availability` in Zigbee2MQTT so a dead device shows offline at once.
  Without it Funkloch notices from the silence (three times the usual interval, at least 30
  minutes).
- **Battery devices** report rarely; without a reading in the last hour their traffic light uses
  the latest hourly median.
- **Repeaters** without sensors send nothing; Funkloch reads their signal from the network map, or
  every 10 minutes with `last_seen` and availability on: see [Repeaters](repeaters.md).
- **Notifications by MQTT** go to the same broker (topic `funkloch/events` by default).
