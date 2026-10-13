# Repeaters

A repeater is a router you add where devices receive poorly: a mains-powered Zigbee router, a
Thread router (a full Thread device), or an ESP32-C6 flashed as either with
[esp32c6-zigbee-router](https://github.com/firsttris/esp32c6-zigbee-router) or
[esp32c6-thread-router](https://github.com/firsttris/esp32c6-thread-router). Funkloch shows
whether devices actually use it and whether their signal got better.

## Where to look

- **The repeater's page**: under **Connections**, *Connected through this device* counts the
  devices that use it as their parent. Each one has its traffic light and the date since when it is
  connected through the repeater.
- **The page of a device behind it**: the parent change is marked in the signal chart, so the
  history before and after the repeater sits side by side. *Connected through* names the repeater.
- **Network map**: the repeater's way to the coordinator or border router, with the link quality
  on every line, and the devices hanging on it.
- **Heatmap**: the hours turning from red to green from the day the repeater went in.
- **Events**: *parent changed* for each device that moves to the repeater (switch on the topology
  rule to be notified).

## Zigbee: a router that sends nothing itself

A pure repeater has no sensors, so it never sends a state message, and Zigbee2MQTT publishes
nothing for it. Funkloch then takes its signal from the network map: the LQI of its link towards
the coordinator, every time a map is read (every 6 hours by default). It does so only for routers
that sent no reading of their own in the last two hours.

For a reading every 10 minutes instead, set two options in Zigbee2MQTT's `configuration.yaml` (or
under **Settings** in its frontend) and restart it:

```yaml
advanced:
  # publish the device state, linkquality included, on every message, not only on changes
  last_seen: ISO_8601
availability:
  # ping routers that stay silent; 10 minutes is the default for mains-powered devices
  enabled: true
  active:
    timeout: 10
```

With availability on, Zigbee2MQTT pings a silent router every 10 minutes; with `last_seen` on,
the answer is published with its `linkquality`, which Funkloch takes as a reading. Availability
also tells Funkloch at once when the repeater is unplugged. Both options are from Zigbee2MQTT's
`lib/util/settings.schema.json`.

Nothing changes on the repeater itself: the ESPHome configuration stays as it is.

## Thread: router-eligible and router

A Thread repeater joins as a child first: *router-eligible (REED)*. Thread makes it a router only
when the mesh needs one, which can take minutes or not happen in a small network. Funkloch shows
the role and reports the promotion as *role changed*. Its signal is how its parent (as a child) or
the best neighboring router (as a router) hears it, every 5 minutes, with border router images that
have the `/api` resources (see [Thread](thread.md)).

Nothing changes on the repeater or the border router for this.

## How the way to the root is drawn

Routers have no parent: Zigbee neighbor tables list them as siblings, Thread routers talk as
equals. Funkloch gives each router an uplink: of its neighbors one hop closer to the coordinator or
border router, the one with the best link. That is the line drawn as its parent on the map and the
device named under *Connected through*; it is Funkloch's reading of the map, not a route the
network reports.
