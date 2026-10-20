#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_config
require_apptainer

status=0
for suffix in frontend backend seaweedfs db; do
    instance="$INSTANCE_PREFIX-$suffix"
    if instance_exists "$instance"; then
        stop_instance "$instance" || status=1
    fi
done
exit "$status"
