#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Python 3 não encontrado. Instale: brew install python"
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "[AVISO] ffprobe não encontrado — instale: brew install ffmpeg"
fi

echo "Usando: $($PY --version)"
exec "$PY" server.py
