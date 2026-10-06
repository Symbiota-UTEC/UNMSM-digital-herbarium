# Docker Compose deployment

The repository uses one shared Compose file and an environment-specific file:

- `docker-compose.yaml` — PostGIS, SeaweedFS, network and persistent data volumes.
- `docker-compose.dev.yaml` — reload-enabled backend, Vite HMR, source mounts, and local development ports.
- `docker-compose.prod.yaml` — built backend and frontend containers. Frontend is published on port `3000`, API on port `8000`; Postgres and SeaweedFS are not published.

Use `make dev` or `make prd` from the repository root. Switching stacks removes the
other environment's containers and network, but keeps named volumes. `make stop-all`
removes volumes and permanently deletes the database and image data.

## Production setup

1. Copy the root and backend environment templates:

   ```bash
   cp .env.sample .env
   cp backend/config/.env.sample backend/config/.env
   ```

2. Set matching `USERNAME`, `PASSWORD`, and `DATABASE` values in both files. Set
   `BACKEND_CORS_ALLOW_ORIGINS` in the root `.env` to the frontend's exact origin,
   for example `http://203.0.113.10:3000`. Set `VITE_API_URL` to the public backend
   URL, for example `http://203.0.113.10:8000/api`. These Vite values are embedded
   when the frontend image is built.

3. In `backend/config/.env`, set a unique `SECRET_KEY` and a strong `ADMIN_PASSWORD`.
   Compose overrides the backend's `HOST` and `PORT` with `db` and `5432` so the
   backend can reach Postgres on the Compose network.

4. Start the production stack and create the initial admin/catalog data:

   ```bash
   make prd
   make seed-all ENV=prod
   ```

   The frontend is available at `http://<VPS-IP>:3000` and the API at
   `http://<VPS-IP>:8000`. Open those ports in the VPS/provider firewall. The
   camera integration also needs a `VITE_CAMERA_BASE_URL` reachable by users' browsers.

`SERVICE=backend` also selects production for seed commands if `ENV` is omitted.
For operations, `make ps ENV=prod` and `make logs ENV=prod` select the production
Compose files. `make prd` rebuilds the images and restarts the stack without deleting
its volumes.

## Moving existing SeaweedFS data to the persistent volume

The previous Compose configuration stored SeaweedFS files in the container's writable
layer. That layer is deleted when the old container is removed. If the existing
`herbarium_seaweedfs` container has uploads, export `/data` **before** the first
`make dev` or `make prd` with the new Compose files:

```bash
docker stop herbarium_seaweedfs
mkdir -p /tmp/herbarium-seaweed-data
docker cp herbarium_seaweedfs:/data/. /tmp/herbarium-seaweed-data/
```

Keep the backup, then remove the old container and seed the new named volume while
SeaweedFS is stopped:

```bash
docker rm herbarium_seaweedfs
docker volume create herbarium_seaweeddata
docker run --rm \
  -v herbarium_seaweeddata:/target \
  -v /tmp/herbarium-seaweed-data:/source:ro \
  alpine sh -c 'cp -a /source/. /target/'
docker run --rm -v herbarium_seaweeddata:/data alpine du -sh /data
```

After verifying the copied volume, run `make prd` (or `make dev`). Keep the exported
directory until uploaded images have been checked in the application. If the old
SeaweedFS container has no valuable uploads, no migration is needed.
