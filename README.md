<p align="center">
  <img src="public/icon.png" width="120" alt="IPTV VOD">
</p>

# 📺 Stremio IPTV VOD

<p align="center">
  <a href="https://ko-fi.com/jappoman">
    <img alt="Support on Ko-fi" src="https://img.shields.io/badge/Support%20me%20on%20Ko--fi-%23FF5E5B?logo=ko-fi&logoColor=white&style=for-the-badge">
  </a>
  <a href="https://github.com/jappoman/stremio-iptv-vod/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/jappoman/stremio-iptv-vod?style=for-the-badge">
  </a>
  <a href="LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/github/license/jappoman/stremio-iptv-vod?style=for-the-badge">
  </a>
</p>

A **Stremio** addon that provides **VOD movies and TV series** from your IPTV
provider (**Xtream Codes** / `player_api.php`): it resolves titles from other
addons' catalogs (IMDb/Cinemeta, TMDB, Xperience…) against the IPTV server and
returns streams in the format recognized by **AIOStreams**.

The addon is **stream-only**: it has no catalogs of its own, so it **never
shows up in Stremio's search results**. Configuration (server URL, username,
password) happens through a simple web page served by the addon itself.

> 🔗 **Live instance** (author's server): [stremio-iptv-vod.duckdns.org](https://stremio-iptv-vod.duckdns.org/)
> — open the configuration page, enter your IPTV credentials and install the
> addon in Stremio with the generated URL. You can also run it yourself
> (Docker / source / Render), see [Hosting / deployment](#-hosting--deployment).

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

### ⚡ AWS Lambda (serverless, recommended)

The addon runs as a single **AWS Lambda** exposed through a public
**Lambda Function URL** (no API Gateway, no VPC, no containers). Architecture:

```text
Stremio / Browser
        |
        | HTTPS
        v
Lambda Function URL  (public, authType NONE)
        |
        v
AWS Lambda (Node.js 24, ARM64, esbuild bundle)
        |
        v
Xtream Codes / IPTV provider   (API calls only)
```

- The **video never transits through Lambda**: streams returned to Stremio
  are **direct URLs of the IPTV provider**.
- The config model is unchanged: host/username/password come from the user in
  the addon URL, nothing is stored in AWS.
- **In-memory cache** (`TTLCache`) is kept as-is: it is useful across *warm*
  invocations of the same execution environment, but **cold starts start with
  an empty cache** and different execution environments have separate caches
  (accepted: no DynamoDB/S3 persistence in this version). Logs contain a
  per-environment id (`execution environment <id> initialized`) and
  `cache <name>:hit|miss` lines to reason about cache behavior.
- **Cost protection**: an AWS Budget alert is configured for this personal
  account. The public endpoint has no WAF/CloudFront in this version; the
  initial AWS account quota does not permit a per-function reserved-concurrency
  cap. Within the Lambda free tier (1M requests/month, 400,000 GB-s) this
  addon costs **$0** for personal use.
- **Region**: deployments default to `us-east-1` (N. Virginia), selected for
  low Lambda and CloudWatch pricing. It can be overridden with `AWS_REGION`
  or CDK context if latency to the IPTV provider becomes a stronger concern.

**Deploy (CDK v2 + GitHub OIDC):**

1. **One-time account setup** (in the dedicated AWS account):
   ```bash
   aws sts get-caller-identity --query Account --output text
   npx cdk bootstrap aws://<ACCOUNT>/us-east-1
   ```
2. **GitHub**: create the Environment `prod` with the Environment Secret
   `AWS_DEPLOY_ROLE_ARN` = ARN of a role in the AWS account that trusts
   GitHub OIDC (see [GitHub OIDC](#github-oidc) below) with permissions for
   CloudFormation, S3 (assets), IAM, Lambda and Logs.
3. Push to `main` (changes under `src/`, `infra/`, `package*.json`) or run
   the `deploy-aws` workflow manually (`workflow_dispatch`). The workflow:
   `npm ci` → `npm test` → `cdk synth` → `cdk deploy --require-approval never`
   → **smoke tests** on the deployed Function URL (`/healthz` must return
   200, `/manifest.json` must be a valid Stremio manifest).
4. The CloudFormation outputs are `FunctionUrl` and `FunctionName`
   (`infra/cdk-out/cdk-outputs.json` after the workflow run).

**Local CDK commands** (from `infra/`):

```bash
npm ci            # install CDK tooling (aws-cdk-lib, esbuild, typescript)
npm run build     # tsc
npx cdk synth     # render the CloudFormation template (cdk.out/)
npx cdk deploy    # deploy (requires AWS credentials in the environment)
```

### GitHub OIDC (deploy role)

The `deploy-aws` workflow authenticates to AWS **without access keys**,
via GitHub OIDC. Create a role in the AWS account that trusts GitHub's OIDC
provider and put its ARN in the GitHub Environment Secret
`AWS_DEPLOY_ROLE_ARN` (Environment `prod`).

Minimum trust policy for the role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:jappoman@4927559/stremio-iptv-vod@1329483255:environment:prod"
        }
      }
    }
  ]
}
```

Attach a permissions policy allowing at least: `cloudformation:*`,
`s3:*` (on the CDK staging bucket), `iam:*` (Lambda role), `lambda:*`,
`logs:*`. The `AWS_DEPLOY_ROLE_ARN` secret must NOT be a static access key.

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
  app.js         Express app (routes, middleware, Stremio router) — no listen()
  index.js       Local entry point (app.listen)
  lambda.js      AWS Lambda handler (serverless-http)
  manifest.js    Addon manifest (config: host/username/password/format)
  config.js      Configuration resolution (from the addon URL only)
  iptv.js        Xtream Codes client (player_api.php) with cache
  resolve.js     External ID resolution (Cinemeta/IMDb, TMDB) to IPTV
  handlers.js    Stream handlers
  format.js      Builds stream fields in the AIOStreams format
  cache.js       In-memory TTL cache
  landing.html   Web configuration page
test/            Test suite (node --test, no extra dependencies)
infra/           AWS CDK v2 (Lambda + Function URL), see AWS Lambda section
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
