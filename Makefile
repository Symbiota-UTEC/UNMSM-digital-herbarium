COMPOSE = docker compose
EXEC_TTY_FLAG = $(if $(MAKE_TERMOUT),,-T)
COMPOSE_BASE = -f docker-compose.yaml
COMPOSE_DEV = $(COMPOSE_BASE) -f docker-compose.dev.yaml
COMPOSE_PROD = $(COMPOSE_BASE) -f docker-compose.prod.yaml
COMPOSE_ALL = $(COMPOSE_BASE) -f docker-compose.dev.yaml -f docker-compose.prod.yaml

# ENV selects the Compose stack; SERVICE may infer the stack when ENV is omitted.
ENV ?= $(if $(filter backend,$(SERVICE)),prod,dev)
ifeq ($(ENV),dev)
ACTIVE_COMPOSE = $(COMPOSE_DEV)
SERVICE ?= backend-dev
ifneq ($(SERVICE),backend-dev)
$(error SERVICE=$(SERVICE) is not valid with ENV=dev; use backend-dev or set ENV=prod)
endif
else ifeq ($(ENV),prod)
ACTIVE_COMPOSE = $(COMPOSE_PROD)
SERVICE ?= backend
ifneq ($(SERVICE),backend)
$(error SERVICE=$(SERVICE) is not valid with ENV=prod; use backend or set ENV=dev)
endif
else
$(error ENV must be either dev or prod)
endif

.PHONY: dev prd stop stop-all logs ps seed-admin seed-geo seed-all reset-db

## Auto-refresh: backend --reload + Vite HMR (sin build, cambios en vivo)
## Frontend: http://localhost:5173 | Backend: http://localhost:8001
dev:
	$(COMPOSE) $(COMPOSE_ALL) down --remove-orphans
	$(COMPOSE) $(COMPOSE_DEV) up --build db seaweedfs backend-dev frontend-dev

## Reconstruye sin caché y levanta solo los servicios de producción
prd:
	$(COMPOSE) $(COMPOSE_PROD) build --no-cache backend frontend
	$(COMPOSE) $(COMPOSE_ALL) down --remove-orphans
	$(COMPOSE) $(COMPOSE_PROD) up -d db seaweedfs backend frontend

## Para todos los contenedores sin eliminarlos
stop:
	$(COMPOSE) $(COMPOSE_ALL) stop

## Para y elimina contenedores, redes y volúmenes
stop-all:
	$(COMPOSE) $(COMPOSE_ALL) down -v

## Logs en tiempo real (ctrl+c para salir)
logs:
	$(COMPOSE) $(ACTIVE_COMPOSE) logs -f

## Estado de los contenedores. Usa ENV=prod para production
ps:
	$(COMPOSE) $(ACTIVE_COMPOSE) ps

## ¡Destructivo! Borra todas las tablas y las recrea vacías. Solo backend-dev (make dev);
## no se corre solo, hay que lanzarlo a mano cuando de verdad quieras una base limpia.
reset-db:
	$(COMPOSE) $(COMPOSE_DEV) exec -T backend-dev python -m backend.scripts.reset_database

# Ninguno de los siguientes corre solo con `make dev`: se lanzan a mano una vez el backend
# esté healthy. Usa ENV=prod o SERVICE=backend para sembrar la instancia de producción.
ADM3 ?=

## Crea el admin por defecto. Uso: make seed-admin [SERVICE=backend]
seed-admin:
	$(COMPOSE) $(ACTIVE_COMPOSE) exec $(EXEC_TTY_FLAG) $(SERVICE) python -m backend.scripts.create_admin

## Siembra países + divisiones administrativas (INEI + GeoNames).
## Uso: make seed-geo [ADM3="BR,MX"] [SERVICE=backend] — ADM3 añade nivel 3 de otros países
seed-geo:
	$(COMPOSE) $(ACTIVE_COMPOSE) exec $(EXEC_TTY_FLAG) $(SERVICE) python -m backend.scripts.seed_admin_divisions $(if $(ADM3),--adm3 $(ADM3),)

## Admin + divisiones administrativas, en ese orden. Uso: make seed-all [ADM3="BR,MX"] [SERVICE=backend]
seed-all: seed-admin seed-geo
