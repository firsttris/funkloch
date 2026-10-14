# Installation

Funkloch is one container image for amd64 and arm64: `tristanteu/funkloch` on Docker Hub. It
keeps everything in one SQLite file in `/data` and listens on port 8090.

## Podman Quadlet

`~/.config/containers/systemd/funkloch.container` (rootless) or
`/etc/containers/systemd/funkloch.container`:

```ini
[Unit]
Description=Funkloch

[Container]
Image=docker.io/tristanteu/funkloch:latest
ContainerName=funkloch
Network=host
Volume=funkloch-data:/data
Environment=ZIGBEE2MQTT_MQTT_URL=mqtt://localhost:1883
Environment=ZIGBEE2MQTT_MQTT_USER=funkloch
Environment=ZIGBEE2MQTT_MQTT_PASSWORD=secret
Environment=OTBR_URL=http://localhost:8081
Environment=TZ=Europe/Berlin
AutoUpdate=registry

[Service]
Restart=always

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user start funkloch
```

`podman auto-update` (or its timer, `systemctl --user enable --now podman-auto-update.timer`) pulls
new releases.

## Docker Compose

```yaml
services:
  funkloch:
    image: tristanteu/funkloch:latest
    container_name: funkloch
    network_mode: host
    volumes:
      - funkloch-data:/data
    environment:
      ZIGBEE2MQTT_MQTT_URL: mqtt://localhost:1883
      ZIGBEE2MQTT_MQTT_USER: funkloch
      ZIGBEE2MQTT_MQTT_PASSWORD: secret
      OTBR_URL: http://localhost:8081
      TZ: Europe/Berlin
    restart: unless-stopped

volumes:
  funkloch-data:
```

With `network_mode: host`, `localhost` is the server itself. Without host networking, publish the
port (`ports: ["8090:8090"]`) and use addresses the container can reach, e.g. the broker's
container name in the same Compose network.

!!! note "Bind mount instead of a volume"
    The container runs as user `bun` (uid 1000). A host directory needs to belong to it:
    `chown 1000:1000 ./data`, or with Podman `Volume=./data:/data:U`.

## First start

Open `http://<host>:8090`. The first visit asks for the admin password (at least 10 characters);
until then anyone who reaches the port could set it, so do this right after the start. Funkloch
then signs you in for 30 days per browser. A page that stays open after its session ended (a
logout elsewhere, a password change) goes to the login with its next click.

Forgot the password? Start once with `FUNKLOCH_RESET_PASSWORD=1`: it removes the password and
every session, and the next visit sets a new one. Remove the variable again afterwards.

## Environment variables

Each network is on when its variable is set; everything else has a default.

| Variable | Meaning | Default |
|---|---|---|
| `ZIGBEE2MQTT_MQTT_URL` | MQTT broker of Zigbee2MQTT, e.g. `mqtt://localhost:1883` or `mqtts://…`; empty: Zigbee off | |
| `ZIGBEE2MQTT_MQTT_USER`, `ZIGBEE2MQTT_MQTT_PASSWORD` | broker login | |
| `ZIGBEE2MQTT_BASE_TOPIC` | Zigbee2MQTT base topic | `zigbee2mqtt` |
| `ZIGBEE2MQTT_NETWORKMAP_HOURS` | hours between two network maps until changed in the settings, at least 1 | `6` |
| `OTBR_URL` | REST API of the OpenThread Border Router, e.g. `http://localhost:8081`; empty: Thread off | |
| `PORT` | port of the web UI | `8090` |
| `DATA_DIR` | folder of the SQLite database | `/data` |
| `TZ` | time zone for day boundaries, the heatmap, the 3 a.m. jobs and every date and time on the pages, whatever the browser's zone | `UTC` |
| `LOG_LEVEL` | `trace` to `fatal` | `info` |
| `FUNKLOCH_RESET_PASSWORD` | `1`: forget the admin password at start | |
| `FUNKLOCH_DEMO` | `1`: a demo network instead of your own, no login | |
| `FUNKLOCH_DEMO_NOW` | with the demo: an ISO time it stands still at, without live readings (for the screenshots) | |

Thresholds, the network map interval, retention, notification rules and channels are set in the
web UI (**Settings** and **Events**) and kept in the database.

## Behind a reverse proxy

Funkloch works on a sub-domain (not under a sub-path). The proxy needs to pass the `Host` header
(or `X-Forwarded-Host`) and `X-Forwarded-Proto`; with `https` the session cookie is marked
`Secure`. Form posts from another origin are refused, so the browser must reach Funkloch under the
address the proxy forwards.

After five wrong passwords within 15 minutes an address waits until the window has passed. The
address is the last entry of `X-Forwarded-For`, the one the proxy appends; a client that reaches
the port directly can set that header itself, so do not open the port itself to the internet.

The live updates are a server-sent event stream at `/api/live`; Funkloch already sends
`X-Accel-Buffering: no` for nginx.

=== "Caddy"

    ```
    funkloch.example.com {
        reverse_proxy localhost:8090
    }
    ```

=== "nginx"

    ```nginx
    server {
        server_name funkloch.example.com;
        location / {
            proxy_pass http://127.0.0.1:8090;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 1h;
        }
    }
    ```

Set the public address under **Events → Notifications** as well, so notifications link to the
device.

## Health check

`GET /healthz` answers `200` with `{"ok":true,…}` when the database answers and every network is
connected, otherwise `503` with the adapter that is not. The image runs it every 30 seconds.

## Backup and data

The database is `/data/funkloch.db` (with `-wal` and `-shm` beside it while it runs). Stop the
container and copy the three files, or back up the volume. Raw readings are kept 14 days, hourly
values a year (both in **Settings**); for 100 devices the file stays at a few hundred MB.

## Update

Pull the new image and restart: `podman auto-update` or `docker compose pull && docker compose up
-d`. The database is migrated at start; a backup before a major release does no harm.
