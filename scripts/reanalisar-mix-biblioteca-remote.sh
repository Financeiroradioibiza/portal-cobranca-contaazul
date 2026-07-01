#!/usr/bin/env bash
# Reanalisa mix/trim no cloud2 (worker Docker). Rode do Mac/repo local — NÃO precisa cd /opt/...
#
#   bash scripts/reanalisar-mix-biblioteca-remote.sh
#   bash scripts/reanalisar-mix-biblioteca-remote.sh --limit=20
#
# Variáveis: CLOUD2_HOST, CLOUD2_INFRA_DIR (default /opt/portal-ibiza/infra)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
LIMIT=100
for arg in "$@"; do
  case "$arg" in
    --limit=*) LIMIT="${arg#*=}" ;;
  esac
done

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)

echo "Reanalisando até $LIMIT faixa(s) no cloud2 ($REMOTE)…"

"${SSH[@]}" "$REMOTE" "cd '$INFRA' && LIMIT='$LIMIT' docker compose exec -T -e LIMIT worker-audio node --input-type=module" < "$ROOT/scripts/reanalisar-mix-biblioteca-worker.mjs"
