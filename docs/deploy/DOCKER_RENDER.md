# Docker + Render deploy (Sovereign Assistant)

Monorepo packaging for **frontend SPA** (`aais-frontend`) + **Python AAIS API** (task-bus, OAuth, middleware plugs).

`aais-middleware` is a **Node library/CLI** wired by the Python host — **not** a separate container or Render service.

Frontend Docker details (Dockerfile, nginx, Vite/WSS env): [`frontend/docs/RENDER_DEPLOY.md`](../../frontend/docs/RENDER_DEPLOY.md).

## File map

| Path | Role |
|------|------|
| `Dockerfile` | Multi-stage Python API (`uvicorn app.main:app`) |
| `frontend/Dockerfile` | Landed Vite → nginx SPA (do not fork) |
| `frontend/nginx/default.conf.template` | SPA + `/api` + `/ws` (`API_UPSTREAM`) |
| `frontend/docs/RENDER_DEPLOY.md` | Frontend build args / Render options |
| `docker-compose.yml` | Local: `api` + `frontend` (volume for `.runtime/`) |
| `render.yaml` | Blueprint: aais-api + aais-frontend (+ optional platform mesh) |
| `.dockerignore` | Excludes `.runtime/`, models, `runtime/bin`, secrets, `node_modules` |

Heavier pilot stack: `deploy/pilot/docker-compose.yml` (Postgres/Redis/MinIO).

## Local: Docker Compose

```bash
cp .env.example .env          # optional provider / OAuth keys — never commit secrets
docker compose up --build
```

| Surface | URL |
|---------|-----|
| Sovereign UI | http://localhost:3000/sovereign |
| Task Bus | http://localhost:3000/task-bus |
| API health | http://localhost:8000/health |
| Frontend health | http://localhost:3000/healthz |

Empty `VITE_API_BASE_URL` → same-origin; nginx proxies `/api` and `/ws` to `api:8000`.

```bash
# Frontend-only (expects API reachable as API_UPSTREAM)
docker compose -f frontend/docker-compose.yml up --build
# → http://localhost:3080
```

## API URL modes

1. **Same-origin (compose / Docker FE)** — empty `VITE_API_BASE_URL`; set `API_UPSTREAM=api:8000`.
2. **Split hosts (typical Render)** — build-time `VITE_API_BASE_URL=https://<aais-api>.onrender.com`.

`/sovereign/*` needs SPA fallback (nginx `try_files` in landed template).

## Render Blueprint

1. Push branch → Render **New → Blueprint** → `render.yaml`.
2. Deploy **aais-api**; note `https://…onrender.com`.
3. Configure **aais-frontend** (static Blueprint Option B; health via CDN):
   - `VITE_API_BASE_URL=https://<aais-api-host>` (required on Render — no `/api` proxy)
   - Optional: `VITE_AAIS_WS_URL=wss://<aais-api-host>/ws/chat/{sessionId}`
   - Docker FE (`frontend/Dockerfile`, Option A) is for compose/self-host (`API_UPSTREAM`)
4. Fill env groups `aais-provider-keys` and `aais-oauth-middleware`.
5. OAuth redirect URIs → frontend origin, e.g. `https://<aais-frontend>/operator/oauth/callback`.

### Service layout

| Service | Type | Notes |
|---------|------|--------|
| `aais-api` | web (Docker, root `Dockerfile`) | Health `/health`; **disk** `/app/.runtime` |
| `aais-frontend` | static | SPA `/* → index.html`; Vite env at **build** time |
| `platform-*` | optional mesh | Postgres + Redis; not required for Sovereign MVP |

## Env checklist

From `.env.example` (Render secrets / compose `.env` only):

| Area | Keys |
|------|------|
| LLM | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, `AAIS_*` models |
| Gmail OAuth | `AAIS_GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` |
| Microsoft | `AAIS_MS_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`, `AAIS_MS_OAUTH_TENANT` |
| Tokens | `AAIS_GMAIL_ACCESS_TOKEN`, `AAIS_MS_GRAPH_TOKEN` (prefer OAuth store on disk) |
| Runtime | `AAIS_RUNTIME_DIR`, `JARVIS_DATA_DIR` → `/app/.runtime/aais-data` |
| Frontend | `VITE_API_BASE_URL`, `VITE_AAIS_WS_*`, `API_UPSTREAM` |

Never put secrets in `VITE_*` (public in the JS bundle).

## WebSockets on Render

- API: `/ws/chat/{session_id}`
- Use **`wss://`** to the API host (Render TLS)
- Split static/Docker FE without nginx WS proxy: set `VITE_AAIS_WS_URL` or derive from HTTPS `VITE_API_BASE_URL`

## Persistent token store (critical gap)

OAuth artifacts live under **`.runtime/oauth/`** (AAIS data under `.runtime/`).

| Environment | Behavior |
|-------------|----------|
| Compose | Volume `aais_runtime` persists |
| Render **with** `aais-runtime` disk on `aais-api` | Persists on that instance |
| Render **without** disk | **Ephemeral** — tokens wiped every deploy/restart |
| Multi-instance | Disk not shared across replicas — single instance or external secret store |

Do not commit `.runtime/` or bake tokens into images.

## Health

- API: `GET /health`, `GET /health/details`
- Frontend container: `GET /healthz`

## Verify

```bash
docker compose build
docker compose up -d
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:3000/healthz
```
