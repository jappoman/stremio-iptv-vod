terraform {
  required_version = ">= 1.5"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.10"
    }
  }
  # Stato remoto su Object Storage OCI (free tier: 10 GB, qui servono pochi KB).
  # Il workflow passa `endpoint` con -backend-config (serve il namespace
  # dell'account, ricavato automaticamente dalla OCI CLI).
  backend "s3" {
    bucket                      = "stremio-iptv-vod-tfstate"
    key                         = "terraform.tfstate"
    region                      = "eu-milan-1"
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    force_path_style            = true
  }
}

provider "oci" {
  region = var.region
}

locals {
  # compartimento di default = root (tenancy): il tier Always Free è a livello account
  compartment_id = var.compartment_ocid != "" ? var.compartment_ocid : var.tenancy_ocid
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Immagine Ubuntu 24.04 adatta alla shape scelta (A1 = ARM, E2 = AMD)
data "oci_core_images" "ubuntu" {
  compartment_id           = local.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# --- Rete ---
resource "oci_core_vcn" "main" {
  compartment_id = local.compartment_id
  cidr_block     = "10.0.0.0/16"
  display_name   = "stremio-iptv-vod-vcn"
  dns_label      = "iptvvod"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "public-rt"
  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = local.compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "public-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    protocol    = "6" # TCP
    source      = var.ssh_source_cidr
    description = "SSH (limita al tuo IP!)"
    tcp_options {
      max = 22
      min = 22
    }
  }
  ingress_security_rules {
    protocol    = "6"
    source      = "0.0.0.0/0"
    description = "HTTP (Caddy)"
    tcp_options {
      max = 80
      min = 80
    }
  }
  ingress_security_rules {
    protocol    = "6"
    source      = "0.0.0.0/0"
    description = "HTTPS (Caddy)"
    tcp_options {
      max = 443
      min = 443
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id    = local.compartment_id
  vcn_id            = oci_core_vcn.main.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "public-subnet"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.public.id]
}

# --- VM Always Free ---
resource "oci_core_instance" "addon" {
  compartment_id      = local.compartment_id
  availability_domain = var.availability_domain != "" ? var.availability_domain : data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.shape
  display_name        = "stremio-iptv-vod"

  dynamic "shape_config" {
    for_each = var.is_flexible ? [1] : []
    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memory_in_gbs
    }
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/user-data.sh.tftpl", {
      duckdns_domain = var.duckdns_domain
      duckdns_token  = var.duckdns_token
      image          = var.container_image
    }))
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "primary-vnic"
  }
}

output "public_ip" {
  description = "IP pubblico della VM"
  value       = oci_core_instance.addon.public_ip
}

output "url" {
  description = "URL dell'addon (HTTPS via Caddy/DuckDNS)"
  value       = "https://${var.duckdns_domain}.duckdns.org/"
}
