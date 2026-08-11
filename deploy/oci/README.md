# Deploy su Oracle Cloud "Always Free" — via GitHub Action + OpenTofu

L'addon viene deployato automaticamente sul tuo tier **Always Free** di Oracle
a ogni push su `main`:

```
push su main
  ├─ Action "docker-publish" → builda l'immagine (amd64+arm64) su GHCR
  └─ Action "deploy-oci"     → OpenTofu crea/aggiorna su Oracle:
                                 VCN + firewall (22/80/443)
                                 VM VM.Standard.E2.1.Micro (free AMD, quasi sempre
                                 disponibile; A1 2 OCPU/12 GB su richiesta via Variables)
                                 cloud-init: Docker, addon da GHCR, Caddy (HTTPS),
                                             DuckDNS (aggiorna l'IP), Watchtower
                                             (aggiorna il container a ogni push)
```

**Tutto resta dentro il tier Always Free**: VM E2.1.Micro o A1 2 OCPU/12 GB,
Object Storage (10 GB free — lo stato remoto occupa pochi KB), niente costi.
La shape di default è `VM.Standard.E2.1.Micro` (si ottiene quasi sempre);
per l'A1 basta impostare le Variables `OCI_SHAPE`/`OCI_IS_FLEXIBLE`.
`ocpus`/`memory_in_gbs` restano nei limiti free (2 OCPU / 12 GB A1), quindi
è impossibile sforare.

---

## Configurazione una tantum

### A. Console Oracle (~10 minuti)

1. **Account**: <https://www.oracle.com/cloud/free/> (la carta serve solo per
   verificare l'identità; restare nel free tier = 0 €).
2. **API key** (per OpenTofu): *Profilo utente (in alto a destra) → API keys →
   Add API key → Generate*. Scarica il file `.pem` (sarà `OCI_API_KEY`) e
   copia **Tenancy OCID**, **User OCID** e **Fingerprint**.
3. **Customer Secret Key** (per lo stato remoto): *Profilo utente →
   Customer Secret Keys → Generate Secret Key* → copia **Access Key**
   (`OCI_ACCESS_KEY`) e **Secret Key** (`OCI_SECRET_KEY`).
4. Il **bucket** per lo stato lo crea da solo la Action al primo run.

### B. Chiave SSH

```bash
ssh-keygen -t ed25519 -C "oracle-vm"
cat ~/.ssh/id_ed25519.pub   # → OCI_SSH_PUBLIC_KEY
```

### C. DuckDNS (gratis)

<https://www.duckdns.org> → crea un sottodominio (es. `mioaddon`) → copia il
**token** → `DUCKDNS_DOMAIN = mioaddon`, `DUCKDNS_TOKEN = <token>`.

### D. Pacchetto GHCR pubblico

GitHub → *Packages → stremio-iptv-vod → Package settings → Change visibility →
**Public*** (altrimenti `docker pull` sulla VM dà `denied`).

### E. GitHub Secrets e Variables

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Valore |
|---|---|
| `OCI_TENANCY_OCID` | Tenancy OCID (console) |
| `OCI_USER_OCID` | User OCID |
| `OCI_FINGERPRINT` | Fingerprint della API key |
| `OCI_PRIVATE_KEY` | **contenuto intero** del file `.pem` della API key (più righe, incollato tutto) |
| `OCI_REGION` | es. `eu-milan-1` (la tua regione) |
| `OCI_ACCESS_KEY` / `OCI_CUSTOMER_SECRET_KEY` | Customer Secret Key (punto A.3): Access Key e Secret Key |
| `OCI_NAMESPACE` | namespace Object Storage (console → bucket → mostra namespace) |
| `OCI_SSH_PUBLIC_KEY` | contenuto di `id_ed25519.pub` |
| `DUCKDNS_DOMAIN` | sottodominio **senza** `.duckdns.org` |
| `DUCKDNS_TOKEN` | token DuckDNS |

| Variabile (scheda *Variables*) | Valore |
|---|---|
| `OCI_SSH_SOURCE_CIDR` | il **tuo IP** per SSH (es. `84.123.45.67/32`); vuota = `0.0.0.0/0` (sconsigliato) |

Opzionale: `OCI_COMPARTMENT_OCID` (se vuoi un compartimento diverso dal root).

Il bucket per lo stato remoto viene creato da solo dalla Action al primo run
(via OCI CLI con l'API key — nessuna installazione aggiuntiva: usa un venv).

---

## Dopo la configurazione

Basta un **push su `main`** (o *Actions → deploy-oci → Run workflow*). La
Action esegue `tofu plan` + `tofu apply`; allo stato remoto (Object Storage)
si riaggancia da sola, quindi non duplica la VM ai run successivi.

Al termine:

- Apri `https://mioaddon.duckdns.org/` → pagina di configurazione dell'addon.
- Inserisci host/username/password IPTV, copia l'URL addon e installalo in
  Stremio.
- **Aggiornamenti**: a ogni push su `main` Watchtower aggiorna il container
  in VM entro ~5 minuti (l'Action `deploy-oci` non riparte se cambiano solo
  i sorgenti: l'immagine arriva da GHCR).

## Note

- **Shape di default = `VM.Standard.E2.1.Micro`** (AMD, free, quasi sempre
  disponibile — a differenza dell'A1, spesso "Out of host capacity"). Se
  `apply` fallisce comunque con *"Out of host capacity"*: riprova la Action
  dopo un po', oppure imposta un'AD diversa (Variable `OCI_AVAILABILITY_DOMAIN`).
- **A1 più potente (2 OCPU / 12 GB free)** quando la capacity c'è: Variables
  `OCI_SHAPE = VM.Standard.A1.Flex` e `OCI_IS_FLEXIBLE = true` (per la
  flessibile puoi anche ridurre a 1 OCPU / 6 GB con `OCI_OCPUS`/`OCI_MEMORY_GB`:
  meno risorse = più probabilità di capacity).
- **cloud-init gira solo al primo boot**: modifiche al `user-data.sh.tftpl`
  su una VM esistente richiedono `tofu apply -replace=oci_core_instance.addon`
  (la VM viene ricreata, l'IP cambia).
- **IP datacenter**: se nei log dell'addon vedi timeout verso il server IPTV,
  il pannello blocca gli IP Oracle per l'API → l'addon da remoto non risolve
  i titoli (in quel caso: tunnel Cloudflare da casa o altro host).
- **Token DuckDNS** finisce nel metadata `user_data` dell'istanza e nello
  stato remoto: è a basso impatto (aggiorna solo quel sottodominio).

## Uso locale (opzionale)

```bash
cd deploy/oci
cp terraform.tfvars.example terraform.tfvars   # e compila i valori
export AWS_ACCESS_KEY_ID=<OCI_ACCESS_KEY> AWS_SECRET_ACCESS_KEY=<OCI_SECRET_KEY>
tofu init -input=false -backend-config="bucket=stremio-iptv-vod-tfstate" \
  -backend-config="key=terraform.tfstate" \
  -backend-config="region=<REGIONE>" \
  -backend-config="endpoint=https://<NAMESPACE>.compat.objectstorage.<REGIONE>.oraclecloud.com"
tofu plan && tofu apply
```

Attenzione: lo stato è **condiviso** con la Action — non applicare modifiche
locali mentre la Action è in esecuzione.
