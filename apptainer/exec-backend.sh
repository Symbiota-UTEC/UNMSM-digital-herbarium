#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_config
require_apptainer

if (($# == 0)); then
    echo "Usage: $0 command [arguments...]" >&2
    exit 2
fi
if [[ ! -r "$BACKEND_ENV_FILE" ]]; then
    echo "Backend environment file not found: $BACKEND_ENV_FILE" >&2
    exit 1
fi
instance="$INSTANCE_PREFIX-backend"
if ! instance_exists "$instance"; then
    echo "Backend instance $instance is not running." >&2
    exit 1
fi

backend_apptainer exec --userns --cleanenv --no-eval "instance://$instance" "$@"
