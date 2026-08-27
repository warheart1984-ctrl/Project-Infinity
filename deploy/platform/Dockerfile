FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    AAIS_WORKSPACE_ROOT=/app \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 platform \
    && useradd --uid 1000 --gid platform --create-home platform

COPY pyproject.toml README.md LICENSE ./
COPY platform ./platform
COPY aais ./aais
COPY app ./app
COPY src ./src
COPY scorpion ./scorpion
COPY forge ./forge
COPY governance ./governance
COPY tools ./tools
# Platform adapters import these governed subsystems at API startup. They are
# packages in the project distribution, so the platform image must carry their
# source as well as the platform package itself.
COPY ai_factory ./ai_factory
COPY lab ./lab
COPY mechanic ./mechanic
COPY slingshot ./slingshot
COPY triangulation ./triangulation
# These are non-package assets reached by governed factory/platform workflows.
COPY factory ./factory
COPY schemas ./schemas

RUN pip install --upgrade pip wheel setuptools \
    && pip install . \
    && python -c "import aais, app, src, scorpion, forge, ai_factory, lab, mechanic, slingshot, triangulation, tools; from platform.api import create_app; print('platform package closure ok')"

RUN mkdir -p /app/.runtime \
    && chown -R platform:platform /app

USER platform

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8090/v1/health || exit 1

CMD ["python", "-m", "platform", "serve", "--host", "0.0.0.0", "--port", "8090"]
