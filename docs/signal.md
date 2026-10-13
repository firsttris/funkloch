# Signal, trend and reachability

## Score

Every reading becomes a score from 0 to 100, so Zigbee and Thread fit on one scale:

| Network | Score | Chart shows |
|---|---|---|
| Zigbee | LQI / 255 × 100 | LQI 0–255 |
| Thread | RSSI from −100 dBm (0) to −50 dBm (100), capped by the link quality: LQI 3 → 100, 2 → 59, 1 → 24, 0 → 0 | RSSI in dBm |

The score drives the traffic light, the heatmap and the events; the charts keep the network's own
value. LQI values of different Zigbee chips are not strictly comparable; the history of one device
says more than the comparison of two.

## Traffic light

| | Score of the last 60 minutes (median) |
|---|---|
| **Good** | 60 and more |
| **Fair** | 25 to 59 |
| **Weak** | below 25 |
| **Offline** | not reachable (below) |
| **Unknown** | no reading yet |

Without a reading in the last hour the latest hourly median counts. Both thresholds can be
changed under **Settings**.

## Trend

A linear regression over the hourly medians of the last 72 hours, read as the change it predicts
over those 72 hours: more than 15 points down is **falling**, more than 15 up **rising**. It needs
at least 24 hourly values; a single bad reading does not move it. Each hour of the day first loses
its own mean over the window, so a daily rhythm (a socket that is weak every evening) is no trend
and the verdict does not change with the time of day; a change from day to day still counts.

## Reachability

A device is **offline** when

- Zigbee2MQTT reports it offline (availability), or
- it has been silent for three times its usual interval between messages, at least 30 minutes.
  The usual interval is the gap a moment of the last 7 days typically falls into (the median of
  the gaps, weighted by their length), so a remote that sends bursts of presses seconds apart
  keeps the long pauses between them as its interval.

A device without a known interval is judged by the report only. Coordinators and border routers
are never marked offline from silence; their state comes from the bridge.

## Recurring patterns

Once a day (3 a.m.) Funkloch looks at the last 7 days by hour. A device that is weak at the same
hours on at least 5 of 7 days (a window of at most 12 hours), and rarely weak outside it, gets a
**recurring pattern**: typically Wi-Fi load in the evening or a device that runs at that time.

## Storage

| Data | Kept |
|---|---|
| every reading | 14 days (2–90) |
| hourly median, min, max, message count, minutes offline | 365 days (30–3650) |
| network maps | as long as the hourly values |
| events | as long as the hourly values |
