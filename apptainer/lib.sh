#!/usr/bin/env bash

APPTAINER_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$APPTAINER_DIR/.." && pwd)

# Postgres, FastAPI, and SeaweedFS HTTP/gRPC listeners share the host network.
readonly -a INTERNAL_PORTS=(5432 8000 8080 8333 8888 9333 18080 18333 18888 19333)

load_config() {
    DEPLOY_ENV=${DEPLOY_ENV:-"$APPTAINER_DIR/deploy.env"}
    if [[ ! -r "$DEPLOY_ENV" ]]; then
        echo "Deployment config not found: $DEPLOY_ENV"
        echo "Copy deploy.env.example to deploy.env and edit it."
        return 1
    fi

    # This is an operator-owned shell config, not a dotenv file from an untrusted source.
    set -a
    # shellcheck source=/dev/null
    source "$DEPLOY_ENV"
    set +a

    INSTANCE_PREFIX=${INSTANCE_PREFIX:-herbarium}
    DATA_DIR=${DATA_DIR:-"$HOME/herbarium-data"}
    SIF_DIR=${SIF_DIR:-"$APPTAINER_DIR/images"}
    BACKEND_ENV_FILE=${BACKEND_ENV_FILE:-"$REPO_ROOT/backend/config/.env"}
    DB_INIT_DIR=${DB_INIT_DIR:-"$REPO_ROOT/db/init"}
    DB_USERNAME=${DB_USERNAME:-herbarium}
    DB_PASSWORD=${DB_PASSWORD:-}
    DB_DATABASE=${DB_DATABASE:-herbarium}
    PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME:-localhost}
    PUBLIC_IP=${PUBLIC_IP:-}
    HTTPS_PORT=${HTTPS_PORT:-8443}
    ENABLE_IPV6=${ENABLE_IPV6-false}
    RUN_DIR=${RUN_DIR:-"$DATA_DIR/run"}
}

validate_ipv6() {
    case "$ENABLE_IPV6" in
        true|false) ;;
        *)
            echo "ENABLE_IPV6 must be true or false." >&2
            return 1
            ;;
    esac
}

require_apptainer() {
    if ! command -v apptainer >/dev/null 2>&1; then
        echo "Apptainer is required but was not found in PATH." >&2
        return 1
    fi
}

instance_exists() {
    apptainer instance list 2>/dev/null | awk -v name="$1" 'NR > 1 && $1 == name { found = 1 } END { exit !found }'
}

postgres_apptainer() {
    APPTAINERENV_POSTGRES_USER="$DB_USERNAME" APPTAINERENV_POSTGRES_PASSWORD="$DB_PASSWORD" APPTAINERENV_POSTGRES_DB="$DB_DATABASE" APPTAINERENV_PGDATA=/var/lib/postgresql/data apptainer "$@"
}

backend_apptainer() {
    APPTAINERENV_USERNAME="$DB_USERNAME" APPTAINERENV_PASSWORD="$DB_PASSWORD" APPTAINERENV_DATABASE="$DB_DATABASE" APPTAINERENV_HOST=127.0.0.1 APPTAINERENV_PORT=5432 APPTAINERENV_SEAWEEDFS_INTERNAL_URL=http://127.0.0.1:8888 APPTAINERENV_BACKEND_CORS_ALLOW_ORIGINS="https://$PUBLIC_HOSTNAME:$HTTPS_PORT" apptainer "$@"
}

stop_instance() {
    apptainer instance stop --signal SIGTERM --timeout 120 "$1"
}

port_open() {
    local port=$1
    local host=${2:-127.0.0.1}
    (exec 3<>"/dev/tcp/$host/$port") >/dev/null 2>&1
}

check_ports_available() {
    local port
    for port in "${INTERNAL_PORTS[@]}" "$HTTPS_PORT"; do
        if port_open "$port"; then
            echo "Port $port is already listening on localhost; stop the conflicting service first." >&2
            return 1
        fi
    done
    if [[ "${ENABLE_IPV6:-false}" == true ]] && port_open "$HTTPS_PORT" ::1; then
        echo "Port $HTTPS_PORT is already listening on IPv6 loopback (::1); stop the conflicting service first." >&2
        return 1
    fi
}

render_frontend_config() {
    local ipv6_listener=""
    if [[ "$ENABLE_IPV6" == true ]]; then
        ipv6_listener="listen [::]:$HTTPS_PORT ssl ipv6only=on;"
    fi
    sed -e "s/@HTTPS_PORT@/$HTTPS_PORT/g" -e "s/@IPV6_LISTENER@/$ipv6_listener/" "$APPTAINER_DIR/nginx/frontend.conf.template"
}

https_ready() {
    curl --ipv4 --noproxy '*' --insecure --silent --fail --max-time 2 "https://127.0.0.1:$HTTPS_PORT/" >/dev/null || return 1
    if [[ "$ENABLE_IPV6" == true ]]; then
        curl --ipv6 --noproxy '*' --insecure --silent --fail --max-time 2 "https://[::1]:$HTTPS_PORT/" >/dev/null || return 1
    fi
}

validate_port() {
    if [[ ! "$HTTPS_PORT" =~ ^[0-9]{1,5}$ ]]; then
        echo "HTTPS_PORT must be a number between 1024 and 65535." >&2
        return 1
    fi
    HTTPS_PORT=$((10#$HTTPS_PORT))
    if ((HTTPS_PORT < 1024 || HTTPS_PORT > 65535)); then
        echo "HTTPS_PORT must be between 1024 and 65535 for a rootless listener." >&2
        return 1
    fi
    local port
    for port in "${INTERNAL_PORTS[@]}"; do
        if ((HTTPS_PORT == port)); then
            echo "HTTPS_PORT conflicts with an internal database, API, or storage port." >&2
            return 1
        fi
    done
}
