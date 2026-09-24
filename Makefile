COMPOSE = docker compose

.PHONY: dev prd stop stop-all logs ps seed-admin

## Auto-refresh: backend --reload + Vite HMR (sin build, cambios en vivo)
## Frontend: http://localhost:5173 | Backend: http://localhost:8001
dev:
	$(COMPOSE) up db seaweedfs backend-dev frontend-dev

## Reconstruye sin caché y levanta todos los servicios (producción)
prd:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

## Para todos los contenedores sin eliminarlos
stop:
	$(COMPOSE) stop

## Para y elimina contenedores, redes y volúmenes
stop-all:
	$(COMPOSE) down -v

## Logs en tiempo real (ctrl+c para salir)
logs:
	$(COMPOSE) logs -f

## Estado de los contenedores
ps:
	$(COMPOSE) ps

## Crea el admin por defecto y siembra países + divisiones administrativas (INEI + GeoNames).
## No corre solo con `make dev`: hay que lanzarlo a mano una vez el backend esté healthy.
## Uso: make seed-admin [ADM3="BR,MX"] para añadir nivel 3 de otros países
ADM3 ?=
seed-admin:
	$(COMPOSE) exec -T backend-dev python -m backend.scripts.create_admin
	$(COMPOSE) exec -T backend-dev python -m backend.scripts.seed_admin_divisions $(if $(ADM3),--adm3 $(ADM3),)
