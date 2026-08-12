terraform {
  required_version = ">= 1.5"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.10"
    }
  }
  # Remote state on OCI Object Storage (free tier: 10 GB, only a few KB are needed here).
  # The workflow passes bucket+endpoint with -backend-config (namespace from the OCI_NAMESPACE secret).
  backend "s3" {
    bucket                      = "stremio-iptv-vod-tfstate"
    key                         = "terraform.tfstate"
    region                      = "eu-milan-1"
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    use_path_style              = true
  }
}

provider "oci" {
  region = var.region
}

locals {
  # default compartment = root (tenancy): the Always Free tier is account-level
  compartment_id = var.compartment_ocid != "" ? var.compartment_ocid : var.tenancy_ocid
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Ubuntu 24.04 image suitable for the chosen shape (A1 = ARM, E2 = AMD)
data "oci_core_images" "ubuntu" {
  compartment_id           = local.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# --- Network ---
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
    description = "SSH (restrict to your IP!)"
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

# --- Always Free VM ---
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
  description = "Public IP of the VM"
  value       = oci_core_instance.addon.public_ip
}

output "url" {
  description = "Addon URL (HTTPS via Caddy/DuckDNS)"
  value       = "https://${var.duckdns_domain}.duckdns.org/"
}
