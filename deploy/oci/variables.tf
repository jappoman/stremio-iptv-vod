variable "region" {
  description = "Regione OCI (es. eu-milan-1, eu-frankfurt-1, eu-amsterdam-1)"
  type        = string
}

variable "tenancy_ocid" {
  description = "OCID del tenancy (Profilo > Tenancy Info)"
  type        = string
}

variable "compartment_ocid" {
  description = "OCID del compartimento (vuoto = root/tenancy)"
  type        = string
  default     = ""
}

variable "availability_domain" {
  description = "Availability Domain (vuoto = la prima disponibile)"
  type        = string
  default     = ""
}

variable "shape" {
  description = "Shape Always Free (A1 = ARM, E2.1.Micro = AMD)"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "OCPU. Limite Always Free A1 aggiornato: 2 OCPU"
  type        = number
  default     = 2
}

variable "memory_in_gbs" {
  description = "RAM in GB. Limite Always Free A1 aggiornato: 12 GB"
  type        = number
  default     = 12
}

variable "ssh_public_key" {
  description = "Contenuto della chiave pubblica SSH (es. cat ~/.ssh/id_ed25519.pub)"
  type        = string
}

variable "ssh_source_cidr" {
  description = "CIDR che può usare SSH (limitalo al tuo IP: es. 84.123.45.67/32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "is_flexible" {
  description = "true per shape flessibili (A1.Flex, con shape_config); false per shape fisse (es. E2.1.Micro, che non accetta shape_config)"
  type        = bool
  default     = true
}

variable "duckdns_domain" {
  description = "Sottodominio DuckDNS, SENZA .duckdns.org (es. mioaddon)"
  type        = string
}

variable "duckdns_token" {
  description = "Token DuckDNS (https://www.duckdns.org → account → token)"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Immagine Docker dell'addon (deve essere pubblica su GHCR o accessibile via login)"
  type        = string
  default     = "ghcr.io/jappoman/stremio-iptv-vod:main"
}
