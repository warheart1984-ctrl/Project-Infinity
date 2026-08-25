# AAIS API — FastAPI/uvicorn host (Jarvis, task-bus, OAuth, middleware plugs)
# Mythic: Sovereign Assistant backend
# Build: docker build -t aais-api .
# Run:   docker run --rm -p 8000:8000 --env-file .env aais-api

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md LICENSE ./
COPY aais ./aais
COPY app ./app
COPY src ./src
COPY scorpion ./scorpion
COPY forge ./forge
COPY forge_eval ./forge_eval
COPY ai_factory ./ai_factory
COPY evolve_engine ./evolve_engine
COPY lab ./lab
COPY mechanic ./mechanic
COPY slingshot ./slingshot
COPY triangulation ./triangulation
COPY tools ./tools
COPY governance ./governance
COPY schemas ./schemas
COPY docs ./docs
COPY external/beatbox_speakers ./external/beatbox_speakers
COPY external/story_forge ./external/story_forge

RUN pip install --upgrade pip wheel setuptools \
    && pip install --prefix=/install .

# Governance genomes reference these repository-level evidence indexes.  Copy
# them after installation so documentation changes do not invalidate the
# Python dependency layer.
COPY training ./training
COPY evals ./evals


# The FastAPI host invokes the AAIS middleware dispatch CLI. Build it once and
# copy its runtime plus Node into the final image; production never depends on
# a host-installed Node runtime.
FROM node:20-bookworm-slim AS middleware-builder

WORKDIR /build/aais-middleware

COPY aais-middleware/package.json aais-middleware/package-lock.json ./
RUN npm ci

COPY aais-middleware ./
RUN npm run build && npm prune --omit=dev


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    AAIS_RUNTIME_DIR=/app/.runtime/aais-data \
    PATH=/usr/local/bin:$PATH \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 aais \
    && useradd --uid 1000 --gid aais --create-home aais

COPY --from=builder /install /usr/local
# Keep the deployable governance bundle coherent.  A single tree copy avoids
# legacy Docker serialising twenty independent layers and accidentally omitting
# an organ's contracts, proof, or source surface.
COPY --from=builder /build/ /app/
COPY --from=middleware-builder /usr/local /usr/local
COPY --from=middleware-builder /build/aais-middleware ./aais-middleware

RUN node --version && npm --version \
    && mkdir -p /app/.runtime/aais-data /app/.runtime/oauth \
    && chown -R aais:aais /app

USER aais

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

# Render injects $PORT; local compose defaults to 8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
