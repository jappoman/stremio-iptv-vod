variable "region" {
  description = "OCI region (e.g. eu-milan-1, eu-frankfurt-1, eu-amsterdam-1)"
  type        = string
}

variable "tenancy_ocid" {
  description = "Tenancy OCID (Profile > Tenancy Info)"
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID (empty = root/tenancy)"
  type        = string
  default     = ""
}

variable "availability_domain" {
  description = "Availability Domain (empty = the first available one)"
  type        = string
  default     = ""
}

variable "shape" {
  description = "Always Free shape (A1 = ARM, E2.1.Micro = AMD)"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "OCPUs. Always Free A1 limit: 2 OCPUs total (1 OCPU improves capacity chances)"
  type        = number
  default     = 1
}

variable "memory_in_gbs" {
  description = "RAM in GB. Always Free A1 limit: 12 GB total (6 GB is enough and improves capacity)"
  type        = number
  default     = 6
}

variable "ssh_public_key" {
  description = "Contents of the SSH public key (e.g. cat ~/.ssh/id_ed25519.pub)"
  type        = string
}

variable "ssh_source_cidr" {
  description = "CIDR allowed to use SSH (restrict it to your IP: e.g. 84.123.45.67/32)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "is_flexible" {
  description = "true for flexible shapes (A1.Flex, with shape_config); false for fixed shapes (e.g. E2.1.Micro, which does not accept shape_config)"
  type        = bool
  default     = true
}

variable "duckdns_domain" {
  description = "DuckDNS subdomain, WITHOUT .duckdns.org (e.g. myaddon)"
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS token (https://www.duckdns.org -> account -> token)"
  type        = string
  sensitive   = true
}

variable "container_image" {
  description = "Addon Docker image (must be public on GHCR or reachable via login)"
  type        = string
  default     = "ghcr.io/jappoman/stremio-iptv-vod:main"
}
