# Deploy dell'addon su Oracle Cloud "Always Free" con OpenTofu
# Crea VCN + subnet pubblica + security list (22/80/443) + VM A1 (2 OCPU/12 GB)
# e al primo boot installa Docker, avvia l'addon e configura Caddy (HTTPS)
# con un dominio DuckDNS gratuito.

## Prerequisiti (una tantum, si fanno a mano)

1. **Account OCI** su <https://www.oracle.com/cloud/free/> (la carta serve solo
   per la verifica; restare nel tier Always Free = 0€). Nota: il limite
   **Always Free A1 è 2 OCPU / 12 GB di RAM** (aggiornato).
2. **API key OCI** per l'autenticazione di OpenTofu:
   - Console OCI → *Profilo utente → API keys → Add API key* → scarica la
     chiave privata e copia **Tenancy OCID**, **User OCID** e **Fingerprint**.
   - Crea `~/.oci/config`:
     ```
     [DEFAULT]
     user=ocid1.user.oc1..<USER>
     fingerprint=<FP>
     tenancy=ocid1.tenancy.oc1..<TENANCY>
     region=eu-milan-1
     key_file=C:\Users\<tuo-user>\.oci\oci_api_key.pem
     ```
3. **Chiave SSH** per accedere alla VM: `ssh-keygen -t ed25519` e copia il
   contenuto di `~/.ssh/id_ed25519.pub`.
4. **DuckDNS**: crea un sottodominio su <https://www.duckdns.org> e copia il
   **token** (serve per l'aggiornamento automatico dell'IP).
5. **Pacchetto GHCR pubblico**: GitHub → *Packages → stremio-iptv-vod →
   Package settings → Change visibility → Public* (altrimenti `docker pull`
   su ghcr.io dà `denied`). In alternativa cambia `container_image` e fai
   login con un PAT.

## Uso

```bash
cd deploy/oci
cp terraform.tfvars.example terraform.tfvars   # e compila i valori
tofu init
tofu plan
tofu apply
```

Alla fine `tofu output url` mostra `https://<tuo-nome>.duckdns.org/`.

- Configura l'addon aprendo quell'URL (host/username/password IPTV) e copia
  l'URL addon in Stremio.
- Per rimuovere tutto: `tofu destroy`.

## Note

- **Capacity A1**: Oracle segnala spesso "Out of host capacity" sugli A1.
  Riprova `tofu apply` (o `tofu plan` + `apply`) dopo qualche ora, prova un
  altro `availability_domain`, oppure passa alla shape AMD
  `VM.Standard.E2.1.Micro` (1 OCPU/1 GB, basta per l'addon) impostando
  `shape = "VM.Standard.E2.1.Micro"` e **`is_flexible = false`** (le shape
  fisse non accettano `shape_config`; `ocpus`/`memory_in_gbs` vengono
  ignorati).
- **SSH**: `ssh_source_cidr` è aperto a `0.0.0.0/0` di default — limitalo al
  tuo IP (`<tuo-ip>/32`) prima di `apply`.
- **IPv6 DuckDNS**: il cloud-init aggiorna il dominio con `ipv6=disabled`
  (niente record AAAA) così Caddy/Let's Encrypt usano sempre l'IPv4.
- **Token DuckDNS**: finisce nel metadata `user_data` dell'istanza (visibile
  a chi ha accesso in lettura all'istanza in console) e nello stato OpenTofu.
  È un token a basso impatto (aggiorna solo quel sottodominio), ma se vuoi
  puoi rigenerarlo da DuckDNS quando vuoi. Il file `terraform.tfvars` è
  **gitignored**, non committarlo.
- **IP datacenter**: se nei log dell'addon vedi timeout verso il server IPTV,
  il pannello blocca gli IP Oracle per l'API → l'addon da remoto non risolve
  i titoli (in quel caso: tunnel Cloudflare da casa o altro host).
