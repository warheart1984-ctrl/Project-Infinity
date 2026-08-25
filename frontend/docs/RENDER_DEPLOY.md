# Frontend Docker / Render deploy

Package: `frontend/` (npm name `aais-frontend`)

## Local Docker

```bash
cd frontend
docker build -t aais-frontend \
  --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_AAIS_WS_ENABLED=0 \
  .
docker run --rm -p 3080:80 -e API_UPSTREAM=host.docker.internal:8000 aais-frontend
```

Empty `VITE_API_BASE_URL` means the browser uses **same-origin** (`window.location.origin`).
nginx then proxies `/api/` and `/ws/` to `API_UPSTREAM` (default `api:8000` for compose).

With sibling monorepo compose, ensure the Python API service is reachable as hostname `api`
(or set `API_UPSTREAM=<service>:<port>`).

```bash
docker compose -f frontend/docker-compose.yml up --build
# → http://localhost:3080
```

## Render (static SPA or Docker)

### Option A — Docker web service (recommended with this Dockerfile)

| Setting | Value |
|---|---|
| Root directory | `frontend` (or repo root with Dockerfile path) |
| Dockerfile path | `frontend/Dockerfile` |
| Health check path | `/healthz` |

**Build-time env / Docker build args** (public — baked into JS):

| Variable | Required | Example (Render) |
|---|---|---|
| `VITE_API_BASE_URL` | Prefer set when FE and API are **separate** hosts | `https://aais-api.onrender.com` |
| `VITE_API_URL` | Alias of above | same |
| `VITE_AAIS_WS_URL` | Optional explicit WSS | `wss://aais-api.onrender.com/ws/chat/{sessionId}` |
| `VITE_AAIS_WS_PATH` | Path template if deriving from REST | `/ws/chat/{sessionId}` |
| `VITE_AAIS_WS_ENABLED` | `"1"` to allow live lanes | `0` (calm default) |
| `VITE_APP_BASE` | Asset base path | `/` |
| `VITE_ROUTER_BASENAME` | If app is not at domain root | (empty or `/app`) |
| `VITE_PLATFORM_API_BASE` | Platform API if different | (optional) |
| `VITE_AMPLIFY_AUTH` | Cognito gate | leave unset unless configured |

**Runtime env** (container only):

| Variable | Default | Purpose |
|---|---|---|
| `API_UPSTREAM` | `api:8000` | nginx upstream for `/api` + `/ws` (ignored if browser calls absolute `VITE_API_BASE_URL` and WS URL) |

### Option B — Separate Render Static Site + API service

1. Build: `npm ci && npm run build` with `VITE_API_BASE_URL=https://<api-service>.onrender.com`
2. Publish directory: `frontend/build`
3. Set `VITE_AAIS_WS_URL=wss://<api-service>.onrender.com/ws/chat/{sessionId}` if enabling sockets
4. Do **not** put secrets in `VITE_*` — they are public in the client bundle

### HTTPS → WSS

`getAaisWebSocketUrl` maps `https://` REST bases to `wss://` automatically when
`VITE_AAIS_WS_URL` is unset. Never hard-code `ws://localhost` in production builds.

## Production path rules

- No localhost in production API candidate lists (`settings.js` / `platformApi.js`)
- Prefer empty `VITE_API_BASE_URL` + nginx proxy for single-host Docker
- Prefer absolute HTTPS API URL for split Render services

## Secrets

Do not bake OAuth client secrets, API keys, or tokens into `VITE_*` or the image.
Operator credentials stay on the API / Render secret store.
