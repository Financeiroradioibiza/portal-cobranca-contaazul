#!/usr/bin/env bash
# Calibra mix/trim contra mix-trim-calibracao.json — dry-run no cloud2 (não grava).
#
#   bash scripts/calibrar-mix-trim-remote.sh
#
# Edite scripts/mix-trim-calibracao.json com faixas + valores esperados.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)

echo "Enviando fixture e rodando calibração no cloud2…"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$ROOT/scripts/mix-trim-calibracao.json" \
  "$ROOT/scripts/calibrar-mix-trim-worker.mjs" \
  "$REMOTE:/tmp/"

"${SSH[@]}" "$REMOTE" bash -s "$INFRA" <<'REMOTE'
set -euo pipefail
INFRA="$1"
cd "$INFRA"
docker compose cp /tmp/mix-trim-calibracao.json worker-audio:/tmp/mix-trim-calibracao.json
docker compose cp /tmp/calibrar-mix-trim-worker.mjs worker-audio:/tmp/calibrar-mix-trim-worker.mjs
docker compose exec -T -e FIXTURE=/tmp/mix-trim-calibracao.json worker-audio \
  node /tmp/calibrar-mix-trim-worker.mjs
REMOTE
