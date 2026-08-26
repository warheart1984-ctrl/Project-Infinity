FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001

WORKDIR /app
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

RUN useradd --create-home --uid 1000 ledger \
    && mkdir -p /var/lib/jarvis-memoryboard \
    && chown -R ledger:ledger /app /var/lib/jarvis-memoryboard
USER ledger

EXPOSE 8001
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
