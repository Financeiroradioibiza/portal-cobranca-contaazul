#!/usr/bin/env bash
# Ajusta CRIACAO_WORKER_CONCURRENCY no .env Envyron e recria worker-audio (+ api lê a mesma env).
# Uso: bash scripts/set-cloud2-worker-concurrency.sh 4
set -euo pipefail

N="${1:-}"
if [[ ! "$N" =~ ^[1-8]$ ]]; then
  echo "Uso: $0 <1-8>"
  exit 1
fi

REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)

echo "== CRIACAO_WORKER_CONCURRENCY=$N em $REMOTE:$INFRA/.env"
"${SSH[@]}" "$REMOTE" bash -s "$N" "$INFRA" <<'REMOTE'
set -euo pipefail
N="$1"
INFRA="$2"
ENV="$INFRA/.env"
if [[ ! -f "$ENV" ]]; then
  echo "ERRO: $ENV não existe"
  exit 1
fi
if grep -q '^CRIACAO_WORKER_CONCURRENCY=' "$ENV"; then
  sed -i.bak.concurrency-"$(date +%s)" "s/^CRIACAO_WORKER_CONCURRENCY=.*/CRIACAO_WORKER_CONCURRENCY=$N/" "$ENV"
else
  printf '\nCRIACAO_WORKER_CONCURRENCY=%s\n' "$N" >> "$ENV"
fi
grep '^CRIACAO_WORKER_CONCURRENCY=' "$ENV"
cd "$INFRA"
docker compose up -d worker-audio api
sleep 3
docker compose exec -T worker-audio node -e "const c=require('./dist/criacao/config.js').criacaoConfig; console.log('workerConcurrency=', c.workerConcurrency);"
REMOTE

echo "OK — confira log worker-audio: concurrency=$N"
