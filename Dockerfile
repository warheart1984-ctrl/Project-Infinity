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
COPY ai_factory ./ai_factory
COPY lab ./lab
COPY mechanic ./mechanic
COPY slingshot ./slingshot
COPY triangulation ./triangulation
COPY tools ./tools
COPY governance ./governance

RUN pip install --upgrade pip wheel setuptools \
    && pip install --prefix=/install .


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
COPY --from=builder /build/aais ./aais
COPY --from=builder /build/app ./app
COPY --from=builder /build/src ./src
COPY --from=builder /build/scorpion ./scorpion
COPY --from=builder /build/forge ./forge
COPY --from=builder /build/ai_factory ./ai_factory
COPY --from=builder /build/lab ./lab
COPY --from=builder /build/mechanic ./mechanic
COPY --from=builder /build/slingshot ./slingshot
COPY --from=builder /build/triangulation ./triangulation
COPY --from=builder /build/tools ./tools
COPY --from=builder /build/governance ./governance

RUN mkdir -p /app/.runtime/aais-data /app/.runtime/oauth \
    && chown -R aais:aais /app

USER aais

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

# Render injects $PORT; local compose defaults to 8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
