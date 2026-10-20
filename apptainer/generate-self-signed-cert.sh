#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_config

force=0
if [[ "${1:-}" == "--force" && $# -eq 1 ]]; then
    force=1
elif (($# != 0)); then
    echo "Usage: $0 [--force]" >&2
    exit 2
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "OpenSSL is required to generate the certificate." >&2
    exit 1
fi
if [[ ! "$PUBLIC_HOSTNAME" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "PUBLIC_HOSTNAME may contain only letters, digits, dots, and hyphens." >&2
    exit 1
fi

TLS_CERT=${TLS_CERT:-"$SCRIPT_DIR/certs/herbarium.crt"}
TLS_KEY=${TLS_KEY:-"$SCRIPT_DIR/certs/herbarium.key"}
mkdir -p "$(dirname -- "$TLS_CERT")" "$(dirname -- "$TLS_KEY")"
chmod 700 "$(dirname -- "$TLS_KEY")"

if ((force == 0)) && { [[ -e "$TLS_CERT" ]] || [[ -e "$TLS_KEY" ]]; }; then
    echo "A certificate or key already exists. Use --force to replace it." >&2
    exit 1
fi

subject_alt_names="DNS:$PUBLIC_HOSTNAME"
if [[ -n "$PUBLIC_IP" ]]; then
    subject_alt_names+=",IP:$PUBLIC_IP"
fi

umask 077
openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 365 -keyout "$TLS_KEY" -out "$TLS_CERT" -subj "/CN=$PUBLIC_HOSTNAME" -addext "subjectAltName=$subject_alt_names"
chmod 600 "$TLS_KEY"
chmod 644 "$TLS_CERT"
echo "Created self-signed certificate for $PUBLIC_HOSTNAME"
