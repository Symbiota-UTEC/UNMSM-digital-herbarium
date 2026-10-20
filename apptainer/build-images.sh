#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
DEFINITIONS_DIR="$SCRIPT_DIR/definitions"
OUTPUT_DIR=${1:-"$SCRIPT_DIR/images"}
TARGET_PLATFORM=${TARGET_PLATFORM:-linux/amd64}

POSTGIS_IMAGE=postgis/postgis:16-3.5-alpine
SEAWEEDFS_IMAGE=chrislusf/seaweedfs:latest
BACKEND_IMAGE=herbarium/backend:apptainer
FRONTEND_IMAGE=herbarium/frontend:apptainer

if [[ -z "${VITE_CAMERA_BASE_URL:-}" ]]; then
    echo "Set VITE_CAMERA_BASE_URL to the camera API URL users' browsers can reach." >&2
    echo "Example: VITE_CAMERA_BASE_URL=https://camera.example.edu $0" >&2
    exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! command -v apptainer >/dev/null 2>&1; then
    echo "Both Docker and Apptainer must be installed on the image build host." >&2
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not available to this account. Run this on a Docker-enabled build host." >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR=$(cd -- "$OUTPUT_DIR" && pwd)
BUILD_DIR=$(mktemp -d "$OUTPUT_DIR/.build-XXXXXXXX")
trap 'rm -rf -- "$BUILD_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Keep unpacked root filesystems off the host's default /tmp mount. In particular,
# Btrfs subvolumes may not have a parent mount Apptainer can resolve there.
BUILD_TMP_DIR=${APPTAINER_TMPDIR:-"$BUILD_DIR/tmp"}
mkdir -p "$BUILD_TMP_DIR"
BUILD_TMP_DIR=$(cd -- "$BUILD_TMP_DIR" && pwd)

docker pull --platform "$TARGET_PLATFORM" "$POSTGIS_IMAGE"
docker pull --platform "$TARGET_PLATFORM" "$SEAWEEDFS_IMAGE"

docker build --platform "$TARGET_PLATFORM" --tag "$BACKEND_IMAGE" --file "$REPO_ROOT/backend/Dockerfile" "$REPO_ROOT"
docker build --platform "$TARGET_PLATFORM" --tag "$FRONTEND_IMAGE" --build-arg VITE_API_URL=/api --build-arg "VITE_CAMERA_BASE_URL=$VITE_CAMERA_BASE_URL" --file "$REPO_ROOT/frontend/Dockerfile" "$REPO_ROOT/frontend"

build_sif() {
    local name=$1
    # Apptainer enables fakeroot automatically for unprivileged definition builds.
    # Do not force it when the script is already running as root (e.g. via sudo).
    APPTAINER_TMPDIR="$BUILD_TMP_DIR" apptainer build "$BUILD_DIR/$name.sif" "$DEFINITIONS_DIR/$name.def"
}

build_sif postgres
build_sif seaweedfs
build_sif backend
build_sif frontend

(
    cd "$BUILD_DIR"
    sha256sum postgres.sif seaweedfs.sif backend.sif frontend.sif > SHA256SUMS
)

# Publish only after every build and the checksum manifest have succeeded.
# Keep the manifest last so it identifies a completely published image set.
for file in postgres.sif seaweedfs.sif backend.sif frontend.sif SHA256SUMS; do
    mv -f -- "$BUILD_DIR/$file" "$OUTPUT_DIR/$file"
done

echo "Created four SIF images in $OUTPUT_DIR"
echo "Transfer these images and SHA256SUMS to the HPC deployment directory."
