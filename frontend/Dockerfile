# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY package*.json ./
RUN corepack enable || true
RUN if [ -f package-lock.json ]; then \
      npm ci --prefer-offline --no-audit --fund=false; \
    else \
      npm install --no-audit --fund=false --legacy-peer-deps; \
    fi

# Copy source and build
COPY . .
ARG VITE_API_URL
ARG VITE_CAMERA_BASE_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_CAMERA_BASE_URL=${VITE_CAMERA_BASE_URL}
RUN npm run build

# Normalize build output to /out (supports Vite 'dist/' or CRA 'build/')
RUN set -eux; \
    if [ -d dist ]; then OUTDIR=dist; \
    elif [ -d build ]; then OUTDIR=build; \
    else echo "❌ No build output found (expected 'dist/' or 'build/')"; ls -la; exit 1; fi; \
    mkdir -p /out; \
    cp -R "$OUTDIR"/. /out/

# --- Runtime (Nginx) ---
FROM nginx:stable-alpine
# Copy normalized output
COPY --from=build /out /usr/share/nginx/html

# SPA fallback + proxy /api -> backend
RUN printf 'server {\n\
  listen 80;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location /api/ { proxy_pass http://herbarium_backend:8000; }\n\
  location / { try_files $uri /index.html; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
