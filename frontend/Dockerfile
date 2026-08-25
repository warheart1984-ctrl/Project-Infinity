# AAIS operator SPA — Vite production build served by nginx
# Build (same-origin /api proxy for compose):
#   docker build -t aais-frontend ./frontend
# Build (absolute API URL for Render static / split hosts):
#   docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t aais-frontend ./frontend

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.mjs tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Empty = browser same-origin; nginx proxies /api and /ws (see nginx/default.conf.template).
# On Render static sites, set absolute VITE_API_BASE_URL at build time (no reverse proxy).
ARG VITE_API_BASE_URL=
ARG VITE_API_URL=
ARG VITE_AAIS_WS_ENABLED=
ARG VITE_AAIS_WS_URL=
ARG VITE_AAIS_WS_PATH=
ARG VITE_APP_BASE=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_API_URL=$VITE_API_URL \
    VITE_AAIS_WS_ENABLED=$VITE_AAIS_WS_ENABLED \
    VITE_AAIS_WS_URL=$VITE_AAIS_WS_URL \
    VITE_AAIS_WS_PATH=$VITE_AAIS_WS_PATH \
    VITE_APP_BASE=$VITE_APP_BASE

RUN npm run build


FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache wget

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html

ENV API_UPSTREAM=api:8000
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

# Official nginx image runs envsubst on /etc/nginx/templates/*.template → conf.d/
CMD ["nginx", "-g", "daemon off;"]
