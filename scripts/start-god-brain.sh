#!/usr/bin/env bash
# Start the local "God Brain" GGUF server (llama.cpp, Vulkan for AMD GPUs).
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="runtime/models/${GOD_BRAIN_GGUF:-Qwen2.5-3B-Instruct-Q4_K_M.gguf}"
PORT="${GOD_BRAIN_PORT:-8080}"

if [[ ! -f "$MODEL" ]]; then
  echo "Model not found: $MODEL" >&2
  exit 1
fi

echo "Serving $MODEL on http://127.0.0.1:${PORT} ..."
export LD_LIBRARY_PATH="$(pwd)/runtime/bin:${LD_LIBRARY_PATH:-}"
exec runtime/bin/llama-server \
  --model "$MODEL" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --ctx-size 4096 \
  --parallel 1 \
  --n-gpu-layers 999 \
  "$@"
