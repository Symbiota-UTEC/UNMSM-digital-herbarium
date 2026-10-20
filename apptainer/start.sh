#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_config
validate_ipv6
require_apptainer
validate_port

if [[ ! "$INSTANCE_PREFIX" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    echo "INSTANCE_PREFIX must start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens." >&2
    exit 1
fi
if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "replace-with-a-strong-password" ]]; then
    echo "Set a strong DB_PASSWORD in deploy.env before starting the stack." >&2
    exit 1
fi
if [[ ! -r "$BACKEND_ENV_FILE" ]]; then
    echo "Backend environment file not found: $BACKEND_ENV_FILE" >&2
    echo "Copy backend/config/.env.sample to backend/config/.env, then set SECRET_KEY and ADMIN_PASSWORD." >&2
    exit 1
fi
for image in postgres seaweedfs backend frontend; do
    if [[ ! -r "$SIF_DIR/$image.sif" ]]; then
        echo "Missing SIF image: $SIF_DIR/$image.sif" >&2
        exit 1
    fi
done

TLS_CERT=${TLS_CERT:-"$SCRIPT_DIR/certs/herbarium.crt"}
TLS_KEY=${TLS_KEY:-"$SCRIPT_DIR/certs/herbarium.key"}
if [[ ! -r "$TLS_CERT" || ! -r "$TLS_KEY" ]]; then
    echo "TLS certificate/key not found. Run $SCRIPT_DIR/generate-self-signed-cert.sh first." >&2
    exit 1
fi
for path_name in DATA_DIR RUN_DIR SIF_DIR BACKEND_ENV_FILE DB_INIT_DIR TLS_CERT TLS_KEY; do
    if [[ "${!path_name}" != /* ]]; then
        echo "$path_name must be an absolute path." >&2
        exit 1
    fi
done
if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required by start.sh for the final HTTPS readiness check." >&2
    exit 1
fi

mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/seaweedfs" "$DATA_DIR/geonames" "$DATA_DIR/inei" "$RUN_DIR/postgres" "$RUN_DIR/nginx"
chmod 700 "$DATA_DIR" "$DATA_DIR/postgres" "$DATA_DIR/seaweedfs" "$DATA_DIR/geonames" "$DATA_DIR/inei" "$RUN_DIR" "$RUN_DIR/postgres" "$RUN_DIR/nginx"

check_ports_available

POSTGRES_INSTANCE="$INSTANCE_PREFIX-db"
SEAWEEDFS_INSTANCE="$INSTANCE_PREFIX-seaweedfs"
BACKEND_INSTANCE="$INSTANCE_PREFIX-backend"
FRONTEND_INSTANCE="$INSTANCE_PREFIX-frontend"
instances=("$POSTGRES_INSTANCE" "$SEAWEEDFS_INSTANCE" "$BACKEND_INSTANCE" "$FRONTEND_INSTANCE")
for instance in "${instances[@]}"; do
    if instance_exists "$instance"; then
        echo "Apptainer instance $instance is already running. Stop the existing stack first." >&2
        exit 1
    fi
done

rendered_frontend_conf="$RUN_DIR/nginx-frontend.conf"
render_frontend_config > "$rendered_frontend_conf"
chmod 600 "$rendered_frontend_conf"

started=()
startup_complete=0
cleanup() {
    local status=$?
    if ((startup_complete == 0)); then
        echo "Startup did not complete; stopping instances started by this run." >&2
        for ((index=${#started[@]} - 1; index >= 0; index--)); do
            stop_instance "${started[index]}" >/dev/null 2>&1 || true
        done
    fi
    return "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_instance() {
    local launcher=$1
    local instance=$2
    local image=$3
    shift 3
    # No per-container limits are requested. Skip the automatic statistics cgroup,
    # which otherwise requires a user D-Bus session and host tools such as busctl.
    # This is scoped to this command; inherited HPC job cgroups still apply.
    DBUS_SESSION_BUS_ADDRESS='' "$launcher" instance start --userns --cleanenv --no-eval --writable-tmpfs "$@" "$image" "$instance" || return $?
    started+=("$instance")
}

wait_for() {
    local label=$1
    local timeout_seconds=$2
    shift 2
    local deadline=$((SECONDS + timeout_seconds))
    while ((SECONDS < deadline)); do
        if "$@"; then
            echo "$label is ready."
            return 0
        fi
        sleep 2
    done
    echo "Timed out waiting for $label." >&2
    return 1
}

postgres_ready() {
    apptainer exec --userns --cleanenv --no-eval "instance://$POSTGRES_INSTANCE" pg_isready -q -h 127.0.0.1 -U "$DB_USERNAME" -d "$DB_DATABASE"
}
port_ready() {
    port_open "$1"
}
echo "Starting private database and storage services..."
postgres_binds=(--bind "$DATA_DIR/postgres:/var/lib/postgresql/data" --bind "$RUN_DIR/postgres:/var/run/postgresql")
if [[ -d "$DB_INIT_DIR" ]]; then
    postgres_binds+=(--bind "$DB_INIT_DIR:/docker-entrypoint-initdb.d:ro")
fi
start_instance postgres_apptainer "$POSTGRES_INSTANCE" "$SIF_DIR/postgres.sif" "${postgres_binds[@]}"
wait_for PostgreSQL 180 postgres_ready

start_instance apptainer "$SEAWEEDFS_INSTANCE" "$SIF_DIR/seaweedfs.sif" --bind "$DATA_DIR/seaweedfs:/data"
wait_for SeaweedFS 120 port_ready 8888

echo "Starting the application services..."
start_instance backend_apptainer "$BACKEND_INSTANCE" "$SIF_DIR/backend.sif" --bind "$BACKEND_ENV_FILE:/app/backend/config/.env:ro" --bind "$DATA_DIR/geonames:/app/backend/data/geonames" --bind "$DATA_DIR/inei:/app/backend/data/inei"
wait_for Backend 180 port_ready 8000

echo "Starting the HTTPS frontend..."
if ! start_instance apptainer "$FRONTEND_INSTANCE" "$SIF_DIR/frontend.sif" --bind "$rendered_frontend_conf:/etc/nginx/apptainer.conf:ro" --bind "$RUN_DIR/nginx:/tmp/nginx" --bind "$TLS_CERT:/etc/nginx/certs/tls.crt:ro" --bind "$TLS_KEY:/etc/nginx/certs/tls.key:ro" || ! wait_for "HTTPS frontend" 60 https_ready; then
    if [[ "$ENABLE_IPV6" == true ]]; then
        echo "ENABLE_IPV6=true requires working IPv4 and IPv6 HTTPS listeners. Check host IPv6/::1 support, curl IPv6 support, and the frontend log from $SCRIPT_DIR/status.sh; set ENABLE_IPV6=false for IPv4-only operation." >&2
    fi
    exit 1
fi

startup_complete=1
echo
echo "Herbarium is available at https://$PUBLIC_HOSTNAME:$HTTPS_PORT/"
echo "Apptainer instances: $INSTANCE_PREFIX-db, $INSTANCE_PREFIX-seaweedfs, $INSTANCE_PREFIX-backend, $INSTANCE_PREFIX-frontend"
