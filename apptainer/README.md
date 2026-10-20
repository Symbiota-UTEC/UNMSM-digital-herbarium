# Apptainer deployment

This is a production-style, rootless deployment for HPC hosts without Docker. It
uses the existing backend and frontend Dockerfiles, converts those images and
the upstream PostGIS and SeaweedFS images into four SIF files, then runs them
as Apptainer instances. The frontend image contains the only Nginx instance:
it serves the compiled React application, terminates HTTPS on the configured
host port, and forwards /api/ to FastAPI. Postgres, SeaweedFS, and FastAPI
listen only on host loopback.

Apptainer instances are user processes, not system services. They keep running
until stopped or until the scheduler or host ends their job/session. Start them
inside the HPC allocation and storage location intended for a long-running
service. The default setup uses Apptainer's host-integrated network so the
instances can reach one another on 127.0.0.1; it does not use --net.

The start and exec helpers explicitly use --userns to run without setuid image
mounts, including on installations that also provide a setuid starter. The host
must permit unprivileged user namespaces and provide Apptainer's unprivileged
image-mount support (normally squashfuse and FUSE). This avoids the error
"configuration disallows users from mounting SIF squashFS partition in setuid
mode" without changing the host's setuid mount policy. An informational warning
about missing gocryptfs concerns encrypted images; these SIF images are unencrypted.

The helpers request no per-container resource limits and skip Apptainer's optional
statistics cgroup by clearing DBUS_SESSION_BUS_ADDRESS only for each instance-start
command. Instances retain any cgroup limits inherited from their HPC job, but
Apptainer instance statistics are unavailable. The host session environment is
preserved for other commands. This also avoids Apptainer 1.5's rootless cgroup
setup failing to find busctl on NixOS after resetting its internal PATH.

~~~mermaid
flowchart LR
    Browser -->|HTTPS: React and /api| Frontend[Nginx: TLS and React files]
    Frontend -->|/api including image requests| Backend[FastAPI]
    Backend -->|127.0.0.1:5432| Postgres[PostGIS]
    Backend -->|127.0.0.1:8888| SeaweedFS
~~~

## Build the SIF images

Build on a machine with Docker, an accessible Docker daemon, and Apptainer.
Unprivileged builds require Apptainer's fakeroot/user-namespace support. Apptainer
selects fakeroot automatically for these definition-file builds; the script does
not force --fakeroot, so running it with sudo uses actual root privileges instead.
The current workspace can build only when Docker daemon access is available;
otherwise run the command on a Docker-enabled workstation or CI worker.

Set the camera API URL that the application user's browsers can reach. This is
compiled into the frontend image at build time:

~~~
VITE_CAMERA_BASE_URL=https://camera.example.edu ./apptainer/build-images.sh
~~~

If Docker access or the local Apptainer setup requires root, use:

~~~bash
sudo VITE_CAMERA_BASE_URL=https://camera.example.edu ./apptainer/build-images.sh
~~~

Run the deployment start/stop helpers as your normal user on the HPC. Building
images with sudo does not require running the deployed instances as root.

The script builds the backend and frontend with their existing Dockerfiles,
pulls the same PostGIS and SeaweedFS base images used by Compose, and creates:

~~~
postgres.sif
seaweedfs.sif
backend.sif
frontend.sif
SHA256SUMS
~~~

You can rerun the same command to rebuild into the same output directory. Images
and checksums are built in a temporary staging directory first; a failed build
leaves the previous image set intact. After all builds succeed, the script replaces
the four images and writes the new checksum manifest last. Publication uses
individual file renames, so wait for the command to finish before copying the set.

Apptainer also unpacks image filesystems inside that staging directory, avoiding
the host's default /tmp (which can fail mount lookup on some Btrfs layouts).
Allow enough free space for the unpacked images as well as the final SIF files.
To use another existing filesystem with sufficient space and execution enabled,
set APPTAINER_TMPDIR to a directory there. With sudo, pass it on the command line:

~~~bash
sudo APPTAINER_TMPDIR=/var/tmp/herbarium-build VITE_CAMERA_BASE_URL=https://camera.example.edu ./apptainer/build-images.sh
~~~

The default target is linux/amd64. Set TARGET_PLATFORM to another Docker
platform if the HPC compute nodes use a different architecture. Copy the SIF
files, checksum manifest, and the apptainer/ deployment files to the HPC.
SIF files are read-only; rebuild and replace them to update application code.

## Configure and start on the HPC

From the repository root, create the two local config files:

~~~
cp apptainer/deploy.env.example apptainer/deploy.env
cp backend/config/.env.sample backend/config/.env
~~~

Edit apptainer/deploy.env for the HPC:

- Set DATA_DIR to persistent, user-writable storage. Postgres and SeaweedFS
  data and downloaded GeoNames/INEI seed files live there and survive stopping
  or replacing SIF images. Seed downloads require network access on first use;
  existing datasets can instead be placed in DATA_DIR/geonames and DATA_DIR/inei.
- Set DB_USERNAME, DB_PASSWORD, and DB_DATABASE. The helper scripts pass
  these same values to Postgres and the backend.
- Set PUBLIC_HOSTNAME to the name users will browse to, PUBLIC_IP to the
  node address when users will connect by IP, and HTTPS_PORT to a free
  unprivileged port permitted by the HPC firewall. PUBLIC_IP can be empty.
- Set ENABLE_IPV6=true to accept both IPv4 and IPv6 HTTPS connections. The
  default is false for hosts without IPv6; only true and false are accepted.
- Adjust SIF_DIR, BACKEND_ENV_FILE, or DB_INIT_DIR if those files are not
  at the defaults.

In backend/config/.env, replace SECRET_KEY and ADMIN_PASSWORD with strong
values. The start and exec helpers override database connection, the SeaweedFS
internal URL, and CORS origin from deploy.env, so those backend .env entries
do not need to match. The Docker build context excludes local .env files, so they are
not copied into the backend SIF.

The backend environment file is mounted read-only at /app/backend/config/.env
and parsed by the application's existing Python dotenv loader. It is not passed
to Apptainer's shell-evaluated --env-file option. Deployment database credentials
are passed through APPTAINERENV variables with --no-eval, preserving spaces,
dollar signs, commas, and other password characters. The backend constructs its
SQLAlchemy connection URL from separate components so URL characters in passwords
remain valid.

Postgres uses a user-owned socket directory at RUN_DIR/postgres, mounted at
/var/run/postgresql. This keeps its initialization commands and server on the
same socket path. The backend has persistent writable mounts for its two seed
download directories; the bundled Peru ubigeo catalog stays in the image.
Nginx's PID and all temporary paths use /tmp/nginx inside the container, backed
by the user-owned RUN_DIR/nginx directory. The image's root-owned cache directories
do not need to be writable.

Generate the self-signed certificate and start the stack:

~~~
./apptainer/generate-self-signed-cert.sh
./apptainer/start.sh
./apptainer/status.sh
~~~

The certificate includes the configured DNS name and optional IP address.
Clients will show a trust warning until the certificate is added to their trust
store. If you change the hostname or IP later, regenerate it with
./apptainer/generate-self-signed-cert.sh --force.

HTTPS Nginx serves the frontend files directly and forwards /api/ to FastAPI.
Image requests use /api/upload/image/{image_id}: FastAPI fetches the file from
SeaweedFS and streams its bytes to the browser. There is no public SeaweedFS
upstream; /images and /images/ return 404. The other service ports are bound
to loopback and are not exposed to the network. The HPC host firewall must allow
HTTPS_PORT for clients to connect. VITE_CAMERA_BASE_URL is a separate
browser-to-camera URL and must be
reachable from client browsers, preferably over HTTPS.

Before starting any instances, the script checks that the HTTPS port and all
internal service ports are free: 5432, 8000, 8080, 8333, 8888, 9333, 18080,
18333, 18888, and 19333. These include SeaweedFS's HTTP and gRPC listeners.
With ENABLE_IPV6=true, it also checks the HTTPS port on IPv6 loopback (::1).

## IPv6 access

Set ENABLE_IPV6=true in deploy.env and restart the stack to add an IPv6 listener
to the existing frontend Nginx. The IPv4 listener stays enabled. No SIF rebuild
is needed for this setting or the external Nginx template. Postgres, SeaweedFS,
and FastAPI continue communicating over IPv4 loopback.

The host must support IPv6 sockets and IPv6 loopback (::1), and its curl must
include IPv6 support. Startup checks HTTPS on both 127.0.0.1 and [::1], bypassing
proxy environment settings for those local checks. A frontend startup or readiness
failure rolls back the instances started by that attempt; IPv6 does not silently
fall back to IPv4 when enabled. Set ENABLE_IPV6=false on IPv4-only hosts.

For remote access, the HPC node needs a reachable IPv6 address and an IPv6 firewall
rule allowing HTTPS_PORT. Add a DNS AAAA record for PUBLIC_HOSTNAME pointing to
that address; keep an A record for IPv4 clients. Local readiness checks cannot
verify external routing, firewall rules, or DNS.

The certificate's DNS name covers the hostname over either IP family, so enabling
IPv6 for an existing hostname requires no certificate or CORS change. To browse
using a literal IPv6 address, set PUBLIC_IP to that address without brackets and
regenerate the certificate so its IP SAN includes it. Keep PUBLIC_HOSTNAME as a
DNS name. Literal IPv6 URLs need brackets, for example https://[2001:db8::10]:8443/.
The frontend's relative /api requests remain same-origin for either kind of URL.

On the deployment host, check both paths using your hostname and configured port:

~~~bash
curl --noproxy '*' --insecure --fail -4 https://herbarium.example.edu:8443/
curl --noproxy '*' --insecure --fail -6 https://herbarium.example.edu:8443/
curl --noproxy '*' --insecure --fail -4 https://herbarium.example.edu:8443/api/admin-divisions/config
curl --noproxy '*' --insecure --fail -6 https://herbarium.example.edu:8443/api/admin-divisions/config
~~~

The --insecure flag is for the initial self-signed certificate. Repeat the checks
from a remote client, then test login and image upload/download in the browser.

## Application routing

This follows the existing application code: frontend
[uploadService.imageUrl](../frontend/src/services/upload.service.ts) builds
the API download URL, [the image router](../backend/routers/upload/images.py)
handles it, and [get_image](../backend/services/images.py) returns a streaming
response from internal storage. The upload response's legacy publicUrl field
is not consumed by the frontend and does not require a public storage route.
Docker Compose production also runs a single Nginx in the frontend image;
its development stack uses Vite instead.

## Initial data and operations

As in the Compose deployment, database seeding is manual and should be run once
after the backend is ready:

~~~
./apptainer/exec-backend.sh python -m backend.scripts.create_admin
./apptainer/exec-backend.sh python -m backend.scripts.seed_admin_divisions
~~~

The first command creates the initial institution and administrator from the
backend environment file. The second loads the country and administrative
division catalog. Neither runs automatically.

Use ./apptainer/status.sh to list instances and their Apptainer logs, and
./apptainer/stop.sh to stop the stack while keeping all persistent data. To
check transferred images, run cd apptainer/images and then sha256sum -c SHA256SUMS.

Shutdown stops the frontend and backend before storage, sends SIGTERM, and allows
up to 120 seconds per instance before Apptainer's forced-stop fallback. Failed
startup rolls back only the instances it started, in reverse dependency order.

After updating application code or definition files, rebuild the SIF images
before restarting. Changes to database credentials do not rotate passwords in an
already initialized Postgres database; update the database role separately.

For local regression checks, use an environment with the backend dependencies:

~~~bash
python -m unittest discover -s apptainer/tests -v
python -m unittest discover -s backend/tests -p test_database_config.py -v
~~~

The script checks use a simulated Apptainer executable; an actual SIF startup
and persistence check is still needed on the deployment host.

The data directory contains the live database and image files. Back it up
while the services are stopped or with a filesystem snapshot that is consistent
for the HPC storage system. Do not remove it when updating SIF images.
