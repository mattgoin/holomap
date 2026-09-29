# 🛰️ Holomap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Container Image](https://img.shields.io/badge/ghcr.io-holomap-2496ED?logo=docker&logoColor=white)](https://github.com/mattgoin/holomap/pkgs/container/holomap)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![Platform](https://img.shields.io/badge/platform-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)](https://github.com/mattgoin/holomap)

**Holomap** is a real-time, 3D planetary stream visualizer for **Plex Media Server**.

Interfacing directly with the Plex sessions API, Holomap projects active media streams and recent viewer history onto an interactive WebGL globe. Stream trajectories are rendered via dynamic glowing ballistic arcs with geographic coordinates, viewer telemetry, and persistent client caching.

---

## Key Capabilities

* 🌐 **Direct Plex Integration:** Real-time stream telemetry retrieved directly through the Plex Media Server API (`/status/sessions`).
* 🚀 **Interactive 3D WebGL Rendering:** Accelerated by [deck.gl](https://deck.gl/) featuring custom glowing `CometArcLayer` animations and orbital camera controls.
* 📍 **Automated GeoIP Telemetry:** Resolves viewer public IP addresses into precise geographic coordinates with country and municipality identification.
* 💾 **Persistent Tiered Caching:** Low-latency in-memory cache backed by on-disk storage (`geocache.json`) to minimize external resolution requests.
* ⏱️ **Rolling Stream History:** Preserves historical streaming activity over a configurable window (default: 24 hours), maintaining visual context even during idle periods.
* ⚡ **Resource Efficient:** Single, self-contained service requiring under 50 MB of memory with no external database dependencies.

---

## Deployment

### Docker Compose (Recommended)

```yaml
version: '3.8'

services:
  holomap:
    image: ghcr.io/mattgoin/holomap:latest
    container_name: holomap
    restart: unless-stopped
    ports:
      - '3005:3005/tcp'
    environment:
      - PORT=3005
      - PLEX_URL=http://your-plex-server:32400
      - PLEX_TOKEN=your_plex_token_here
      - HOME_LAT=37.7749
      - HOME_LON=-122.4194
      - HOME_NAME=Base Station
      - POLL_INTERVAL_MS=10000
      - HISTORY_RETENTION_HOURS=24
      - TZ=UTC
    volumes:
      - ./data:/app/data
```

### Docker CLI

```bash
docker run -d \
  --name holomap \
  -p 3005:3005 \
  -e PLEX_URL="http://192.168.1.100:32400" \
  -e PLEX_TOKEN="your_plex_token_here" \
  -e HOME_LAT="37.7749" \
  -e HOME_LON="-122.4194" \
  -e HOME_NAME="Base Station" \
  -v ./data:/app/data \
  --restart unless-stopped \
  ghcr.io/mattgoin/holomap:latest
```

---

## Configuration Reference

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3005` | Internal port binding for the HTTP service. |
| `PLEX_URL` | `http://localhost:32400` | Base URL of your Plex Media Server. |
| `PLEX_TOKEN` | *(Required)* | Plex server authentication token (`X-Plex-Token`). |
| `HOME_LAT` | `0.0` | Latitude coordinate of the central host/server anchor node. |
| `HOME_LON` | `0.0` | Longitude coordinate of the central host/server anchor node. |
| `HOME_NAME` | `Base Station` | Display name for the central origin marker on the map. |
| `POLL_INTERVAL_MS` | `10000` | Frequency in milliseconds for polling Plex active sessions. |
| `HISTORY_RETENTION_HOURS` | `24` | Hours of streaming activity retained for historical display. |
| `DATA_DIR` | `/app/data` | Directory where persistent cache and history files are stored. |

### Volume Mounts

| Container Path | Description |
| :--- | :--- |
| `/app/data` | Persists `geocache.json` (IP geolocation cache) and `history.json` (recent session history) across container recreations. |

---

## Architecture

```text
┌──────────────────────┐         ┌────────────────────────┐
│  Plex Media Server   │ ◄─────► │     Holomap Engine     │ ◄─────► ┌──────────────────────┐
│  (:32400/sessions)   │ (Poll)  │   (Express + GeoIP)    │         │  Client Browser UI   │
└──────────────────────┘         └───────────┬────────────┘         │  (deck.gl WebGL 3D)  │
                                             │                      └──────────────────────┘
                                  ┌──────────┴──────────┐
                                  │ Persistent Data Dir │
                                  │ • geocache.json     │
                                  │ • history.json      │
                                  └─────────────────────┘
```

---

## Obtaining a Plex Token

1. Sign in to your Plex Web App.
2. Select any media item, click **More (`...`)**, and choose **Get Info**.
3. Click **View XML** in the lower-left corner of the modal.
4. Locate the URL in your browser's navigation bar; the value assigned to `X-Plex-Token=` at the end is your server token.

---

## Local Development

```bash
# Clone repository
git clone https://github.com/mattgoin/holomap.git
cd holomap

# Install dependencies
npm ci

# Launch development server
PLEX_URL="http://localhost:32400" PLEX_TOKEN="your_token" npm run dev
```

---

## License

This project is licensed under the [MIT License](LICENSE).
