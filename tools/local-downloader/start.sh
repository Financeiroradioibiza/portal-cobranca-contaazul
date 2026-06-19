#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Python 3 não encontrado. Instale com: xcode-select --install"
  echo "Ou via Homebrew: brew install python"
  exit 1
fi

echo "Usando: $($PY --version)"
$PY -m pip install --user -r requirements.txt
exec "$PY" server.py
