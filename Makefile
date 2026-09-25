COMPOSE = docker compose

.PHONY: dev prd stop stop-all logs ps seed-admin seed-geo seed-all reset-db

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

## ¡Destructivo! Borra todas las tablas y las recrea vacías. Solo backend-dev (make dev);
## no se corre solo, hay que lanzarlo a mano cuando de verdad quieras una base limpia.
reset-db:
	$(COMPOSE) exec -T backend-dev python -m backend.scripts.reset_database

# Ninguno de los siguientes corre solo con `make dev`: se lanzan a mano una vez el backend
# esté healthy. SERVICE=backend-dev por defecto (make dev); usa SERVICE=backend para sembrar
# contra `make prd`.
ADM3 ?=
SERVICE ?= backend-dev

## Crea el admin por defecto. Uso: make seed-admin [SERVICE=backend]
seed-admin:
	$(COMPOSE) exec -T $(SERVICE) python -m backend.scripts.create_admin

## Siembra países + divisiones administrativas (INEI + GeoNames).
## Uso: make seed-geo [ADM3="BR,MX"] [SERVICE=backend] — ADM3 añade nivel 3 de otros países
seed-geo:
	$(COMPOSE) exec -T $(SERVICE) python -m backend.scripts.seed_admin_divisions $(if $(ADM3),--adm3 $(ADM3),)

## Admin + divisiones administrativas, en ese orden. Uso: make seed-all [ADM3="BR,MX"] [SERVICE=backend]
seed-all: seed-admin seed-geo
