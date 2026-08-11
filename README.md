<p align="center">
  <img src="public/icon.png" width="120" alt="IPTV VOD">
</p>

# 📺 Stremio IPTV VOD

A **Stremio** addon that provides **VOD movies and TV series** from your IPTV
provider (**Xtream Codes** / `player_api.php`): it resolves titles from other
addons' catalogs (IMDb/Cinemeta, TMDB, Xperience…) against the IPTV server and
returns streams in the format recognized by **AIOStreams**.

The addon is **stream-only**: it has no catalogs of its own, so it **never
shows up in Stremio's search results**. Configuration (server URL, username,
password) happens through a simple web page served by the addon itself.

---

## ✨ Features

- 🔌 **Stream-only** addon: no catalogs, no search results.
- 🔗 **External ID resolution**: `tt<imdb>` (Cinemeta/IMDb) and `tmdb<id>`
  (TMDB, Xperience addons) are searched on the IPTV server and played
  (exact match on Xtream's `tmdb` field, name+year fallback).
- ▶️ Direct streams `http://server/movie/...` and `http://server/series/...`
  (Range requests are supported, so seeking works).
- 📦 File size (probe with `Range: bytes=0-0`, bitrate-based estimate as
  fallback) and 🇮🇹 audio language from episodes.
- ✅ **AIOStreams-compatible** streams: `description` with parseable filename
  (title, year, quality, SxxEyy), `📦 size` and language flags, plus
  `behaviorHints.filename` / `behaviorHints.videoSize`. They also work
  standalone in Stremio (`normal` format option for the classic style).
- ⚙️ Configurable via **web interface** (`/`) or Stremio's native form
  (manifest `configurable`).
- 🧠 In-memory caching of lists and metadata (TTL), keyed by credentials:
  multiple providers can coexist.

## 🔧 How it works

1. Stremio asks all installed stream addons (including this one) for streams
   for a title (`type` + `id`, e.g. `series`, `tt0115341:1:1`).
2. The addon resolves the ID against the IPTV provider:
   - `tt<imdb>` → **Cinemeta** meta → `moviedb_id` (TMDB) → match on the
     Xtream server's `tmdb` field; if the tmdb is missing or inconsistent,
     fallback by **name + year**;
   - `tmdb<id>` → direct match on the `tmdb` field;
   - translated titles (e.g. "The Godfather" → "Il Padrino") stay on the
     tmdb match; unsupported ID formats are ignored.
3. It builds the stream URL (`/movie/...` or `/series/...`) with size,
   quality and language, and returns it to Stremio.

## ⚙️ Installation

Requirements: **Node.js ≥ 18.17**.

### From source

```bash
npm install
npm start
```

The addon starts on `http://127.0.0.1:7000`:

- Configuration page: <http://127.0.0.1:7000/>
- Manifest: <http://127.0.0.1:7000/manifest.json>

Port configurable via the `PORT` environment variable.

### 🐳 Docker

```bash
docker build -t stremio-iptv-vod .
docker run -p 7000:7000 stremio-iptv-vod
```

## 🔑 Configuration

### Web interface (recommended)

1. Open the configuration page (`/`).
2. Enter **IPTV server URL**, **username** and **password**.
3. Press **Test connection**: it verifies the credentials and shows the
   catalog numbers (movies, series, categories).
4. Press **Open in Stremio** (desktop app) or copy the addon URL
   (`.../manifest.json`) and paste it into Stremio (or into AIOStreams as a
   "custom addon").

The configuration is embedded in the addon URL:
`https://your-server/<config>/manifest.json`. Anyone with the URL can use the
credentials: **do not share the link**.

Host, username and password are **always required** (no fallback to files or
environment variables): without them the addon returns no streams.

### Stream format

Option available in the web page and Stremio's native form:

- `aio` (default) — AIOStreams-compatible streams: `description` with
  filename, `📦 size` and language flags, plus
  `behaviorHints.filename/videoSize`. Sources stay `type: http` (no "cached"
  marker: the "http = always available" handling belongs in the AIOStreams
  formatter, see below). Also works standalone in Stremio (the title stays
  readable).
- `normal` — plain Stremio streams (`name`, `title`, `url`) without the AIO
  fields, for a pure classic format.

#### HTTP sources and AIOStreams (formatter)

An http source found by the addon is **always available** (direct download):
AIOStreams however classifies it as `type: http` with "unknown" cache status,
and common formatters show it with a red X. To render it as "cached" (⚡) and
sort it sensibly (cached > torrent with seeders > http > zero-seed torrent)
you edit **the AIOStreams formatter**, not the addon:

- icon (replace the ❌/⚡/🌱 slot):
  `{stream.type::=http["⚡"||{service.cached::istrue["⚡"||{stream.seeders::>0["🌱 {stream.seeders}"||"❌"]}]}]}`
- sorting (Ranked Stream Expressions, with `streamExpressionScore` as the
  first `sortCriteria` key):
  `cached(streams)` → +100 · `seeders(streams, 5)` → +60 ·
  `type(streams, 'http')` → +40 · (everything else → 0)

### Default language

**"Default language if not found"** option (web page and Stremio form,
default `ita`): when the IPTV server does not expose the audio language
(common for movies and some episodes), the stream still carries the chosen
flag (e.g. `🇮🇹 Italian`). If the server provides a language, it always wins.
`none` = show no flag.

### 🚀 Hosting / deployment

Stremio requires **HTTPS** for addons (except on `localhost`), so to use it
remotely you need a public host with TLS.

> ⚠️ **Datacenter IPs and IPTV providers**: a remotely hosted addon only makes
> **API** calls to the IPTV server (`player_api.php`: lists and info); the
> video instead plays from the user's device. If the panel blocks datacenter
> IPs for the API too, you'll see timeouts/errors in the logs and no streams.
> Check right after deploying.

**Free options:**

1. **Oracle Cloud "Always Free" VPS** — always on and free forever (requires
   a card for signup and manual setup). Step-by-step guide below.
2. **Render (free)** — `render.yaml` included: connect the repo on
   <https://render.com> → *New + → Blueprint*. HTTPS included, auto-deploy on
   push. ⚠️ the free tier *sleeps* after ~15 min of inactivity (first access
   up to ~1 min: retry if Stremio times out).
3. **Koyeb (free tier)** — same model (Dockerfile from GitHub, HTTPS), with
   sleep after inactivity.
4. **Cloudflare Tunnel** — for quick tests: `cloudflared tunnel --url
   http://127.0.0.1:7000` exposes localhost over HTTPS (the URL changes at
   every restart).

> ❌ **Hugging Face Spaces (Docker/Gradio)**: since mid-2025 they require a
> **PRO** subscription (only "Static Spaces" are free, and they don't run
> code). No longer a free option for this addon.

**BeamUp** (the historical free hosting for Stremio addons) is
**discontinued**. **ElfHosted** (where streamvix.hayd.uk runs) is **paid**:
it doesn't use a GitHub Action — you submit the repo (with the `Dockerfile`)
and their infrastructure builds and hosts the app.

**Docker image on GHCR** (`.github/workflows/docker-publish.yml`): on every
push to `main` (or `v*` tag) the GitHub Action builds for **amd64 and arm64**
and publishes `ghcr.io/<user>/stremio-iptv-vod` (tags `main` / `vX.Y.Z` /
`sha-…`). ⚠️ GHCR packages are **private by default**: make it public once
(GitHub → *Packages → stremio-iptv-vod → Package settings → Change
visibility → Public*) or log in with a PAT on ghcr.io.

### 🖥️ Oracle Cloud "Always Free" — step-by-step guide

1. **Account**: sign up at <https://www.oracle.com/cloud/free/> (a credit
   card is required for verification, but **nothing is charged** as long as
   you stay within the Always Free tier).
2. **Create the VM**: *Compute → Instances → Create instance*:
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM, up to 2 OCPU / 12 GB free —
     current limit) or **VM.Standard.E2.1.Micro** (AMD, 1 OCPU / 1 GB — enough
     for the addon). The Docker image is multi-arch, it works on both.
   - Image: **Ubuntu 24.04** (or 22.04).
   - SSH keys: generate and **save the key pair** it offers.
3. **Open the ports**: *Networking → Virtual Cloud Networks → Security List* →
   add **Ingress** rules for **TCP 80** and **TCP 443** (and, only for
   testing, 7000).
4. **Connect via SSH**:
   ```bash
   ssh -i <private-key> ubuntu@<PUBLIC_IP>
   ```
5. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker ubuntu   # then log out and back in
   ```
6. **Run the addon**:
   ```bash
   docker run -d --name iptv-vod --restart unless-stopped -p 127.0.0.1:7000:7000 \
     ghcr.io/jappoman/stremio-iptv-vod:main
   ```
   (use `127.0.0.1:7000` and put **Caddy** in front for HTTPS — port 7000
   must not be exposed directly).
7. **HTTPS with Caddy** (Stremio requires it) + a free **DuckDNS** domain
   (`<your-name>.duckdns.org` pointing at the VM's IP):
   ```bash
   sudo apt install -y caddy
   # /etc/caddy/Caddyfile:
   #   your-name.duckdns.org {
   #       reverse_proxy 127.0.0.1:7000
   #   }
   sudo systemctl reload caddy
   ```
8. **Configure**: open `https://your-name.duckdns.org/`, enter
   host/username/password, copy the addon URL and install it in Stremio.
9. **Check the logs** for the datacenter caveat: if you see timeouts towards
   the IPTV server, the panel blocks Oracle IPs for the API (in that case:
   tunnel from home or a provider without blocking).

> Note: the Oracle Ubuntu image ships with an OS-level firewall that only
> allows SSH — the cloud-init in `deploy/oci/` opens and persists ports
> 80/443 automatically (`iptables-persistent`).

## 🚀 Using in Stremio

### Standalone

The addon is an autonomous **stream source**: with the URL copied from the
web page, install it in Stremio (*Addon → Install from URL*). When Stremio
opens an addon without configuration, it shows the **Configure** button which
points to the addon's `/configure` page.

### With catalogs from other addons (IMDb, TMDB, Xperience…)

| ID requested by Stremio                          | How it is resolved                                      |
|--------------------------------------------------|---------------------------------------------------------|
| `tt<imdb>` / `tt<imdb>:<s>:<e>` (Cinemeta, IMDb) | Cinemeta meta → `moviedb_id` → match on Xtream `tmdb`; name+year fallback |
| `tmdb<id>` / `tmdb<id>:<s>:<e>` (TMDB, Xperience addons) | direct match on Xtream's `tmdb` field           |

In practice: you search "Sabrina the Teenage Witch" in another addon's
catalog, click episode 1x1 and the addon finds "Sabrina, vita da strega
(1996)" on the IPTV server and provides the stream (exact TMDB match, with
title+year fallback).

### With AIOStreams

Add the addon URL in AIOStreams as a **custom addon** (the same URL generated
by the web page). AIOStreams will consume the streams in the `aio` format.

#### Step-by-step test with AIOStreams

1. **Run the addon** (`npm start`) and copy the **addon URL** from the
   `http://127.0.0.1:7000/` page — it must end with `.../manifest.json` and
   contain the configuration (the `<config>` part of the URL). ⚠️ **Don't use
   the bare `http://host/manifest.json`**: without the config the addon
   returns no streams.
2. **Run AIOStreams** (Docker):

   ```bash
   docker run -p 8080:3000 \
     -e BASE_URL=http://localhost:8080 \
     -e SECRET_KEY=<64 hex chars, e.g. openssl rand -hex 32> \
     -v aiostreams-data:/app/data \
     ghcr.io/viren070/aiostreams:latest
   ```

   Open `http://localhost:3000/stremio/configure`.
3. **Add the addon**: *Addons* menu → **Custom** preset → fill *Name*
   (e.g. "IPTV VOD") and *Manifest URL* with the URL copied in step 1. For
   the first test tick **Result Passthrough** (no filters applied) and make
   sure *Filters → Stream Type* includes `http`. *Save & Install*.
4. **Install AIOStreams in Stremio** from the *Install to Stremio* button on
   the save page, then open a title (e.g. search "sabrina" and open the
   episode): among the streams "IPTV VOD" should appear.
5. **Debug**: the addon console should show `[iptv-vod] stream request ...
   config=yes` lines. If you see `config=no`, the URL entered in AIOStreams
   is the one without configuration. In AIOStreams' logs (or with
   `LOG_LEVEL=debug`) you can see the fetch of our manifest/stream.
6. **If AIOStreams runs in Docker on the same machine**, use
   `http://host.docker.internal:7000/<config>/manifest.json` instead of
   `127.0.0.1`. If it runs on another server, the addon must be reachable
   from there (tunnel/LAN).

Before all of this you can do a quick test without AIOStreams by opening in
the browser `http://127.0.0.1:7000/api/debug-stream?type=series&id=tt0115341:1:1`:
if the response contains the stream, the addon is ready and the problem (if
any) is only in how the URL was entered.

## 🧩 AIOStreams format

Every returned stream looks like:

```json
{
  "name": "IPTV VOD",
  "title": "Destination X (2025) - S01E01",
  "description": "Destination X (2025).S01E01.mp4\n📦 893 MB\n🇮🇹 Italian",
  "url": "http://server/series/user/password/708949.mp4",
  "behaviorHints": {
    "filename": "Destination X (2025).S01E01.mp4",
    "videoSize": 936655695
  }
}
```

AIOStreams uses `behaviorHints.filename` (or the first line of the
`description`) to derive title/year/quality/season-episode, the size from
`behaviorHints.videoSize` or the `📦 X GB` in the description, and the
languages from the flags. The `description` therefore always follows the
format `<filename>\n📦 <size>\n<flag> <language>`.

## 🔍 Debug & troubleshooting

The addon writes detailed logs to the console (prefix `[iptv-vod]`): every
stream request (type, id, config presence), the resolution result and the
timings. Credentials in stream URLs are masked in the logs.

There's also an endpoint showing the **full resolution trace** of an ID,
directly from the browser:

```
http://localhost:7000/api/debug-stream?type=series&id=tt0115341:1:1&host=<host>&username=<user>&password=<pass>
http://localhost:7000/api/debug-stream?type=movie&id=tmdb11860&host=<host>&username=<user>&password=<pass>
```

The credentials (`host`, `username`, `password`) are passed as parameters.

The response shows every step: ID parse, Cinemeta lookup (name/year/
moviedb_id), match on Xtream's `tmdb` (with `via: tmdb|name`), available
seasons, found episode and stream URL (with masked credentials).

**"No streams available"?** Check the `[iptv-vod]` logs:
- no line → Stremio is not calling the addon (reinstall it);
- `unrecognized id` → the catalog uses an unsupported ID format;
- `NOT resolved` → the title is not on the IPTV server (the trace explains
  why);
- Cinemeta error → the server can't reach `v3-cinemeta.strem.io`.

## 📂 Repository structure

```
public/
  icon.png       Addon icon (served from /public/icon.png)
src/
  index.js       Express server + Stremio protocol router (SDK)
  manifest.js    Addon manifest (config: host/username/password/format)
  config.js      Configuration resolution (from the addon URL only)
  iptv.js        Xtream Codes client (player_api.php) with cache
  resolve.js     External ID resolution (Cinemeta/IMDb, TMDB) to IPTV
  handlers.js    Stream handlers
  format.js      Builds stream fields in the AIOStreams format
  cache.js       In-memory TTL cache
  landing.html   Web configuration page
test/            Test suite (node --test, no extra dependencies)
```

**Internal** IDs (`iptv:...`) only exist as a representation of the resolved
content; Stremio always receives external IDs (`tt...`/`tmdb...`) that the
addon resolves.

## Notes

- Resolving a title the first time takes a few seconds (the IPTV server
  answers with lists of tens of MB); the lists are then cached in memory for
  30 minutes and the metadata for 6 hours.
- The addon's HTTP proxy does not relay the video: streaming URLs point
  directly at the IPTV server, like other IPTV addons.
- The `/api/test` endpoint only accepts POST requests with full credentials;
  if you expose the addon publicly, put it behind an authenticated proxy.

## ☕ Support

If you find this addon useful, you can support its development:

[![ko-fi](https://img.shields.io/badge/Support%20on%20Ko--fi-%23FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/jappoman)

- **Ko-fi**: <https://ko-fi.com/jappoman>

## ⚠️ Disclaimer

This addon is intended for **personal use** with providers whose credentials
you own. It is your responsibility to comply with the laws, the provider's
terms of service and the applicable copyright rules in your jurisdiction.

## 📄 License

[MIT](LICENSE)
