<p align="center">
  <img src="public/icon.png" width="120" alt="IPTV VOD">
</p>

# 📺 Stremio IPTV VOD

Addon per **Stremio** che fornisce **fonti VOD e Serie TV** dal tuo provider
IPTV (protocollo **Xtream Codes** / `player_api.php`): risolve i titoli dei
cataloghi di altri addon (IMDb/Cinemeta, TMDB, Xperience…) verso il server
IPTV e restituisce gli stream, nel formato riconosciuto da **AIOStreams**.

L'addon è **solo stream**: non ha cataloghi propri, quindi **non compare nei
risultati di ricerca** di Stremio. La configurazione (URL del server,
username, password) avviene tramite una semplice pagina web servita
dall'addon stesso.

---

## ✨ Funzionalità

- 🔌 Addon **stream-only**: nessun catalogo, nessun risultato di ricerca.
- 🔗 **Risoluzione id esterni**: `tt<imdb>` (Cinemeta/IMDb) e `tmdb<id>`
  (addon TMDB, Xperience) vengono cercati nel server IPTV e riprodotti
  (match esatto sul `tmdb` di Xtream, fallback per nome+anno).
- ▶️ Stream diretti `http://server/movie/...` e `http://server/series/...`
  (supportano il Range, quindi il riavvolgimento funziona).
- 📦 Dimensione del file (probe con `Range: bytes=0-0`, con stima dal bitrate
  come fallback) e 🇮🇹 lingua audio dagli episodi.
- ✅ Stream **compatibili AIOStreams**: `description` con filename parsabile
  (titolo, anno, qualità, SxxEyy), `📦 dimensione` e bandiere lingua, più
  `behaviorHints.filename` / `behaviorHints.videoSize`. Funzionano anche da
  soli in Stremio (opzione formato `normal` per lo stile classico).
- ⚙️ Configurabile via **interfaccia web** (`/`) oppure con il form nativo di
  Stremio (manifest `configurable`).
- 🧠 Cache in memoria delle liste e dei metadati (TTL), con chiavi per
  credenziali: più provider possono coesistere.

## 🔧 Come funziona

1. Stremio chiede gli stream per un titolo (`type` + `id`, es. `series`,
   `tt0115341:1:1`) a **tutti** gli addon stream installati, incluso questo.
2. L'addon risolve l'id verso il provider IPTV:
   - `tt<imdb>` → meta di **Cinemeta** → `moviedb_id` (TMDB) → match sul campo
     `tmdb` del server Xtream; se il tmdb manca o è incoerente, fallback per
     **nome + anno**;
   - `tmdb<id>` → match diretto sul campo `tmdb`;
   - titoli tradotti (es. "The Godfather" → "Il Padrino") restano sul match
     tmdb; gli id di formato sconosciuto vengono ignorati.
3. Costruisce l'URL dello stream (`/movie/...` o `/series/...`) con
   dimensione, qualità e lingua, e lo restituisce a Stremio.

## ⚙️ Installazione

Requisiti: **Node.js ≥ 18.17**.

### Da sorgente

```bash
npm install
npm start
```

L'addon parte su `http://127.0.0.1:7000`:

- Pagina di configurazione: <http://127.0.0.1:7000/>
- Manifest: <http://127.0.0.1:7000/manifest.json>

Porta configurabile con la variabile `PORT`.

### 🐳 Docker

```bash
docker build -t stremio-iptv-vod .
docker run -p 7000:7000 stremio-iptv-vod
```

## 🔑 Configurazione

### Interfaccia web (consigliata)

1. Apri la pagina di configurazione (`/`).
2. Inserisci **URL server IPTV**, **username** e **password**.
3. Premi **Testa connessione**: verifica le credenziali e mostra i numeri del
   catalogo (film, serie, categorie).
4. Premi **Apri in Stremio** (app desktop) oppure copia l'URL addon
   (`.../manifest.json`) e incollalo in Stremio (o in AIOStreams come
   "custom addon").

La configurazione viene incorporata nell'URL dell'addon:
`https://tuo-server/<config>/manifest.json`. Chi possiede l'URL può usare le
credenziali: **non condividere il link**.

Host, username e password sono **sempre obbligatori** (nessun fallback su
file o variabili d'ambiente): senza di essi l'addon non restituisce stream.

### Formato stream

Opzione disponibile nella pagina web e nel form nativo di Stremio:

- `aio` (default) — stream compatibili AIOStreams: `description` con filename,
  `📦 dimensione` e bandiere lingua, più `behaviorHints.filename/videoSize`.
  Il campo `name` include il marker `⚡ RD` che fa classificare lo stream come
  **cached** da AIOStreams (i VOD IPTV sono direct download: se l'addon li
  trova, sono già pronti da riprodurre — senza il marker AIO li mostrerebbe
  con la X rossa "uncached"). Funziona anche da solo in Stremio (il titolo
  resta leggibile).
- `normal` — stream Stremio essenziali (`name`, `title`, `url`) senza i campi
  AIO, per chi vuole il formato classico puro.

### Lingua di default

Opzione **"Lingua di default se non trovata"** (pagina web e form Stremio,
default `ita`): quando il server IPTV non espone la lingua audio (capita per
i film e alcuni episodi), lo stream riporta comunque la bandiera scelta
(es. `🇮🇹 Italian`). Se la lingua c'è dal server, vince sempre quella.
`none` = non mostrare nessuna bandiera.

### 🚀 Hosting / deploy

Stremio richiede **HTTPS** per gli addon (tranne su `localhost`), quindi per
usarlo da remoto serve un host pubblico con TLS.

> ⚠️ **IP datacenter e provider IPTV**: l'addon hostato da remoto fa solo
> chiamate **API** al server IPTV (`player_api.php`: liste e info); il video
> invece parte dal dispositivo dell'utente. Se il pannello blocca gli IP
> datacenter anche per l'API, vedrai timeout/errori nei log e niente stream.
> Da verificare subito dopo il deploy.

**Opzioni gratuite:**

1. **Oracle Cloud "Always Free" VPS** — sempre acceso e gratuito per sempre
   (richiede carta per la registrazione e setup manuale). Guida passo-passo
   qui sotto.
2. **Render (free)** — `render.yaml` incluso: collega il repo su
   <https://render.com> → *New + → Blueprint*. HTTPS incluso, deploy
   automatico su push. ⚠️ il free tier va in *sleep* dopo ~15 min di
   inattività (primo accesso fino a ~1 min: riprova se Stremio dà timeout).
3. **Koyeb (free tier)** — stesso modello (Dockerfile da GitHub, HTTPS), con
   sleep dopo inattività.
4. **Cloudflare Tunnel** — per test veloci: `cloudflared tunnel --url
   http://127.0.0.1:7000` espone il localhost con HTTPS (URL che cambia a
   ogni riavvio).

> ❌ **Hugging Face Spaces (Docker/Gradio)**: da metà 2025 richiedono
> l'abbonamento **PRO** (gratuite solo le "Static Spaces", che non eseguono
> codice). Non è più un'opzione gratuita per questo addon.

**BeamUp** (l'hosting gratuito storico per addon Stremio) è **discontinuato**.
**ElfHosted** (dove gira streamvix.hayd.uk) è **a pagamento**: non usa una
GitHub Action — si sottopone il repo (con il `Dockerfile`) e la loro
infrastruttura costruisce e hosta l'app.

**Immagine Docker su GHCR** (`.github/workflows/docker-publish.yml`): a ogni
push su `main` (o tag `v*`) la GitHub Action builda per **amd64 e arm64** e
pubblica `ghcr.io/<utente>/stremio-iptv-vod` (tag `main` / `vX.Y.Z` / `sha-…`).
⚠️ I pacchetti GHCR sono **privati di default**: rendilo pubblico una volta
(GitHub → *Packages → stremio-iptv-vod → Package settings → Change
visibility → Public*) oppure fai login con un PAT su ghcr.io.

### 🖥️ Oracle Cloud "Always Free" — guida passo-passo

1. **Account**: iscriviti su <https://www.oracle.com/cloud/free/> (richiede
   una carta di credito per la verifica, ma **non addebita nulla** finché
   resti nel tier Always Free).
2. **Crea la VM**: *Compute → Instances → Create instance*:
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM, fino a 4 OCPU / 24 GB
     gratis) oppure **VM.Standard.E2.1.Micro** (AMD, 1 OCPU / 1 GB — basta
     per l'addon). L'immagine Docker è multi-arch, va bene su entrambe.
   - Image: **Ubuntu 24.04** (o 22.04).
   - SSH keys: genera e **salva la coppia di chiavi** che ti propone.
3. **Apri le porte**: *Networking → Virtual Cloud Networks → Security List* →
   aggiungi le regole **Ingress** per **TCP 80** e **TCP 443** (e, solo per
   test, 7000).
4. **Collegati via SSH**:
   ```bash
   ssh -i <chiave-privata> ubuntu@<IP_PUBBLICO>
   ```
5. **Installa Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker ubuntu   # poi esci e rientra
   ```
6. **Avvia l'addon**:
   ```bash
   docker run -d --name iptv-vod --restart unless-stopped -p 127.0.0.1:7000:7000 \
     ghcr.io/jappoman/stremio-iptv-vod:main
   ```
   (usa `127.0.0.1:7000` e metti **Caddy** davanti per l'HTTPS — la porta
   7000 non va esposta direttamente).
7. **HTTPS con Caddy** (Stremio lo richiede) + un dominio gratuito
   **DuckDNS** (`<tuo-nome>.duckdns.org` puntato all'IP della VM):
   ```bash
   sudo apt install -y caddy
   # /etc/caddy/Caddyfile:
   #   tuo-nome.duckdns.org {
   #       reverse_proxy 127.0.0.1:7000
   #   }
   sudo systemctl reload caddy
   ```
8. **Configura**: apri `https://tuo-nome.duckdns.org/`, inserisci
   host/username/password IPTV, copia l'URL addon e installalo in Stremio.
9. **Controlla i log** per il caveat datacenter: se vedi timeout verso il
   server IPTV, il pannello blocca gli IP Oracle per l'API (in quel caso:
   tunnel da casa o un provider senza blocco).

## 🚀 Uso in Stremio

### Da solo (standalone)

L'addon è una **fonte stream** autonoma: con l'URL copiato dalla pagina web,
installa in Stremio (*Addon → Installa da URL*). Quando Stremio apre un addon
senza configurazione, mostra il pulsante **Configure** che punta alla pagina
`/configure` dell'addon.

### Con i cataloghi di altri addon (IMDb, TMDB, Xperience…)

| Id richiesto da Stremio                          | Come viene risolto                                      |
|--------------------------------------------------|---------------------------------------------------------|
| `tt<imdb>` / `tt<imdb>:<s>:<e>` (Cinemeta, IMDb) | meta di Cinemeta → `moviedb_id` → match sul `tmdb` Xtream; fallback per nome+anno |
| `tmdb<id>` / `tmdb<id>:<s>:<e>` (addon TMDB, Xperience) | match diretto sul campo `tmdb` di Xtream          |

In pratica: cerchi "Sabrina the Teenage Witch" nel catalogo di un altro addon,
clicchi l'episodio 1x1 e l'addon trova "Sabrina, vita da strega (1996)" sul
server IPTV e fornisce lo stream (match esatto via TMDB, con fallback su
titolo+anno).

### Con AIOStreams

Aggiungi l'URL addon in AIOStreams come **custom addon** (stessa URL generata
dalla pagina web). AIOStreams consumerà gli stream nel formato `aio`.

#### Test passo-passo con AIOStreams

1. **Avvia l'addon** (`npm start`) e copia l'**URL addon** dalla pagina
   `http://127.0.0.1:7000/` — deve finire in `.../manifest.json` e contenere
   la configurazione (la parte `<config>` nell'URL). ⚠️ **Non usare l'URL
   nudo `http://host/manifest.json`**: senza la config l'addon non restituisce
   stream.
2. **Avvia AIOStreams** (Docker):

   ```bash
   docker run -p 8080:3000 \
     -e BASE_URL=http://localhost:8080 \
     -e SECRET_KEY=<64 caratteri hex, es. openssl rand -hex 32> \
     -v aiostreams-data:/app/data \
     ghcr.io/viren070/aiostreams:latest
   ```

   Apri `http://localhost:3000/stremio/configure`.
3. **Aggiungi l'addon**: menu *Addons* → preset **Custom** → compila *Name*
   (es. "IPTV VOD") e *Manifest URL* con l'URL copiato al punto 1. Per il
   primo test spunta **Result Passthrough** (nessun filtro applicato) e
   verifica che i *Filters → Stream Type* includano `http`. *Save & Install*.
4. **Installa AIOStreams in Stremio** dal pulsante *Install to Stremio* della
   pagina di salvataggio, poi apri un titolo (es. cerca "sabrina" e apri
   l'episodio): tra gli stream dovrebbe comparire "IPTV VOD".
5. **Debug**: nella console dell'addon devono comparire righe
   `[iptv-vod] stream request ... config=yes`. Se vedi `config=no`, l'URL
   inserito in AIOStreams è quello senza configurazione. Nei log di AIOStreams
   (o con `LOG_LEVEL=debug`) vedi la fetch del nostro manifest/stream.
6. **Se AIOStreams gira in Docker sulla stessa macchina**, usa
   `http://host.docker.internal:7000/<config>/manifest.json` al posto di
   `127.0.0.1`. Se gira su un altro server, l'addon deve essere raggiungibile
   da lì (tunnel/LAN).

Prima di tutto questo puoi fare un test rapido senza AIOStreams aprendo nel
browser `http://127.0.0.1:7000/api/debug-stream?type=series&id=tt0115341:1:1`:
se la risposta contiene lo stream, l'addon è pronto e il problema (se c'è) è
solo nell'inserimento dell'URL.

## 🧩 Formato AIOStreams

Ogni stream restituito ha la forma:

```json
{
  "name": "IPTV VOD",
  "title": "Destination X (2025) - S01E01",
  "description": "Destination X (2025).S01E01.mp4\n📦 893 MB\n🇮🇹 Italian",
  "url": "http://server/series/utente/password/708949.mp4",
  "behaviorHints": {
    "filename": "Destination X (2025).S01E01.mp4",
    "videoSize": 936655695
  }
}
```

AIOStreams usa `behaviorHints.filename` (o la prima riga della `description`)
per ricavare titolo/anno/qualità/stagione-episodio, la dimensione da
`behaviorHints.videoSize` o dal `📦 X GB` in description, e le lingue dalle
bandiere. La `description` segue quindi sempre il formato
`<filename>\n📦 <dimensione>\n<bandiera> <lingua>`.

## 🔍 Debug & Troubleshooting

L'addon scrive log dettagliati sulla console (prefisso `[iptv-vod]`): ogni
richiesta stream (type, id, presenza config), il risultato della risoluzione
e i tempi. Le credenziali negli URL di stream vengono mascherate nei log.

C'è anche un endpoint per vedere la **traccia completa** della risoluzione di
un id, direttamente dal browser:

```
http://localhost:7000/api/debug-stream?type=series&id=tt0115341:1:1&host=<host>&username=<user>&password=<pass>
http://localhost:7000/api/debug-stream?type=movie&id=tmdb11860&host=<host>&username=<user>&password=<pass>
```

Le credenziali (`host`, `username`, `password`) vanno passate come parametri.

La risposta mostra ogni passo: parse dell'id, lookup Cinemeta (nome/anno/
moviedb_id), match sul `tmdb` di Xtream (con `via: tmdb|name`), stagioni
disponibili, episodio trovato e URL stream (con credenziali mascherate).

**"Nessuno stream disponibile"?** Controlla i log `[iptv-vod]`:
- nessuna riga → Stremio non sta chiamando l'addon (re-installalo);
- `id non riconosciuto` → il catalogo usa un formato id non supportato;
- `NON risolto` → il titolo non è sul server IPTV (la traccia spiega perché);
- errore Cinemeta → il server non raggiunge `v3-cinemeta.strem.io`.

## 📂 Struttura del repository

```
public/
  icon.png       Icona dell'addon (servita da /public/icon.png)
src/
  index.js       Server Express + router del protocollo Stremio (SDK)
  manifest.js    Manifest dell'addon (config: host/username/password/formato)
  config.js      Risoluzione configurazione (solo dall'URL dell'addon)
  iptv.js        Client Xtream Codes (player_api.php) con cache
  resolve.js     Risoluzione id esterni (Cinemeta/IMDb, TMDB) verso l'IPTV
  handlers.js    Handler stream
  format.js      Costruzione dei campi stream nel formato AIOStreams
  cache.js       Cache TTL in memoria
  landing.html   Pagina web di configurazione
test/            Suite di test (node --test, nessuna dipendenza extra)
```

Gli id **interni** (`iptv:...`) esistono solo come rappresentazione del
contenuto risolto; a Stremio arrivano sempre id esterni (`tt...`/`tmdb...`)
che l'addon risolve.

## Note

- La prima risoluzione di un titolo richiede qualche secondo (il server IPTV
  risponde con liste anche di decine di MB); le liste vengono poi cacheate in
  memoria per 30 minuti e i meta per 6 ore.
- Il proxy HTTP dell'addon non ritrasmette il video: gli URL di streaming
  puntano direttamente al server IPTV, come per gli altri addon IPTV.
- L'endpoint `/api/test` accetta solo richieste POST con le credenziali
  complete; se esponi l'addon pubblicamente, mettilo dietro un proxy con
  autenticazione.

## ⚠️ Disclaimer

L'addon è pensato per **uso personale** con provider di cui si possiedono le
credenziali. È tua responsabilità rispettare le leggi, i termini di servizio
del provider e le norme sul copyright applicabili nella tua giurisdizione.

## 📄 Licenza

[MIT](LICENSE)
