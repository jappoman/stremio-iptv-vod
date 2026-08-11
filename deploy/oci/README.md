# Deploy to Oracle Cloud "Always Free" — via GitHub Action + OpenTofu

The addon is deployed automatically to your Oracle **Always Free** tier on
every push to `main`:

```
push to main
  ├─ Action "docker-publish" → builds the image (amd64+arm64) to GHCR
  └─ Action "deploy-oci"     → OpenTofu creates/updates on Oracle:
                                 VCN + firewall (22/80/443)
                                 VM VM.Standard.E2.1.Micro (free AMD, almost always
                                 available; A1 2 OCPU/12 GB on request via Variables)
                                 cloud-init: Docker, firewall (80/443), addon from GHCR,
                                             Caddy (HTTPS), DuckDNS (updates the IP),
                                             container self-update every 10 min
```

**Everything stays within the Always Free tier**: E2.1.Micro or A1
2 OCPU/12 GB VM, Object Storage (10 GB free — the remote state is a few KB),
no costs. The default shape is `VM.Standard.E2.1.Micro` (almost always
available); for the A1 just set the `OCI_SHAPE`/`OCI_IS_FLEXIBLE` Variables.
`ocpus`/`memory_in_gbs` stay within the free limits (2 OCPU / 12 GB A1), so
it's impossible to exceed them.

---

## One-time setup

### A. Oracle console (~10 minutes)

1. **Account**: <https://www.oracle.com/cloud/free/> (the card is only for
   identity verification; staying in the free tier = €0).
2. **API key** (for OpenTofu): *User profile (top right) → API keys →
   Add API key → Generate*. Download the `.pem` file (this will be
   `OCI_PRIVATE_KEY`) and copy **Tenancy OCID**, **User OCID** and
   **Fingerprint**.
3. **Customer Secret Key** (for the remote state): *User profile →
   Customer Secret Keys → Generate Secret Key* → copy **Access Key**
   (`OCI_ACCESS_KEY`) and **Secret Key** (`OCI_CUSTOMER_SECRET_KEY`).
4. The **bucket** for the state is created automatically by the Action on the
   first run.

### B. SSH key

```bash
ssh-keygen -t ed25519 -C "oracle-vm"
cat ~/.ssh/id_ed25519.pub   # → OCI_SSH_PUBLIC_KEY
```

### C. DuckDNS (free)

<https://www.duckdns.org> → create a subdomain (e.g. `myaddon`) → copy the
**token** → `DUCKDNS_DOMAIN = myaddon`, `DUCKDNS_TOKEN = <token>`.

### D. Public GHCR package

GitHub → *Packages → stremio-iptv-vod → Package settings → Change visibility →
**Public*** (otherwise `docker pull` on the VM fails with `denied`).

### E. GitHub Secrets and Variables

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `OCI_TENANCY_OCID` | Tenancy OCID (console) |
| `OCI_USER_OCID` | User OCID |
| `OCI_FINGERPRINT` | API key fingerprint |
| `OCI_PRIVATE_KEY` | **full content** of the API key `.pem` file (multiple lines, paste it all) |
| `OCI_REGION` | e.g. `eu-milan-1` (your region) |
| `OCI_ACCESS_KEY` / `OCI_CUSTOMER_SECRET_KEY` | Customer Secret Key (step A.3): Access Key and Secret Key |
| `OCI_NAMESPACE` | Object Storage namespace (console → bucket → show namespace) |
| `OCI_SSH_PUBLIC_KEY` | content of `id_ed25519.pub` |
| `DUCKDNS_DOMAIN` | subdomain **without** `.duckdns.org` |
| `DUCKDNS_TOKEN` | DuckDNS token |

| Variable (*Variables* tab) | Value |
|---|---|
| `OCI_SSH_SOURCE_CIDR` | **your IP** for SSH (e.g. `84.123.45.67/32`); empty = `0.0.0.0/0` (not recommended) |

Optional: `OCI_COMPARTMENT_OCID` (if you want a compartment other than root).

The remote-state bucket is created automatically by the Action on the first
run (via OCI CLI with the API key — no extra installation: it uses a venv).

---

## After the setup

Just a **push to `main`** (or *Actions → deploy-oci → Run workflow*) is
enough. The Action runs `tofu plan` + `tofu apply`; it re-attaches to the
remote state (Object Storage) by itself, so it doesn't duplicate the VM on
subsequent runs.

When it finishes:

- Open `https://myaddon.duckdns.org/` → the addon configuration page.
- Enter host/username/password, copy the addon URL and install it in Stremio.
- **Updates**: every 10 minutes a systemd timer on the VM re-pulls the GHCR
  image and recreates the container if the digest changed (replacing
  Watchtower 1.7.1, which is incompatible with modern Docker: client API 1.25
  vs minimum 1.40). The `deploy-oci` Action does not re-run when only the
  sources change: the image comes from GHCR.

## Notes

- **Default shape = `VM.Standard.E2.1.Micro`** (AMD, free, almost always
  available — unlike the A1, which is often "Out of host capacity"). If
  `apply` still fails with *"Out of host capacity"*: retry the Action after a
  while, or set a different AD (Variable `OCI_AVAILABILITY_DOMAIN`).
- **More powerful A1 (2 OCPU / 12 GB free)** when capacity is available:
  Variables `OCI_SHAPE = VM.Standard.A1.Flex` and `OCI_IS_FLEXIBLE = true`
  (for the flexible shape you can also go down to 1 OCPU / 6 GB with
  `OCI_OCPUS`/`OCI_MEMORY_GB`: fewer resources = better capacity odds).
- **OS firewall**: the Oracle Ubuntu image only allows SSH at the OS level
  (iptables with a final REJECT): cloud-init opens 80/443 and persists them
  (`netfilter-persistent save`), otherwise the Let's Encrypt challenge fails
  even with the OCI security list in place.
- **cloud-init only runs on first boot**: changes to `user-data.sh.tftpl` on
  an existing VM require `tofu apply -replace=oci_core_instance.addon` (the
  VM is recreated, the IP changes).
- **Datacenter IPs**: if you see timeouts towards the IPTV server in the
  addon logs, the panel blocks Oracle IPs for the API → the remote addon
  can't resolve titles (in that case: Cloudflare tunnel from home or another
  host).
- **DuckDNS token** ends up in the instance `user_data` metadata and in the
  remote state: low impact (it only updates that subdomain).

## Local use (optional)

```bash
cd deploy/oci
cp terraform.tfvars.example terraform.tfvars   # and fill in the values
export AWS_ACCESS_KEY_ID=<OCI_ACCESS_KEY> AWS_SECRET_ACCESS_KEY=<OCI_SECRET_KEY>
tofu init -input=false -backend-config="bucket=stremio-iptv-vod-tfstate" \
  -backend-config="key=terraform.tfstate" \
  -backend-config="region=<REGION>" \
  -backend-config="endpoint=https://<NAMESPACE>.compat.objectstorage.<REGION>.oraclecloud.com"
tofu plan && tofu apply
```

Warning: the state is **shared** with the Action — don't apply local changes
while the Action is running.
