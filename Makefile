COMPOSE = docker compose

.PHONY: dev prd stop stop-all logs ps

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
