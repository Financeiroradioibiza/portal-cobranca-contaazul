#!/usr/bin/env bash
# Deploy no cloud2 (portal-ibiza em Docker).
#
# O servidor já tem pipeline LUFS/worker. Modo default (patch) envia só arquivos
# listados — não sobrescreve o app inteiro.
#
# Uso:
#   bash scripts/deploy-cloud2-lufs.sh
#
# Deploy completo (cuidado — pode regredir pipeline do servidor):
#   DEPLOY_MODE=full bash scripts/deploy-cloud2-lufs.sh
#
# Variáveis:
#   CLOUD2_HOST        default: radioibiza@cloudserver165.envyron.cloud
#   CLOUD2_APP_DIR     default: /opt/portal-ibiza/app
#   CLOUD2_INFRA_DIR   default: /opt/portal-ibiza/infra
#   DEPLOY_MODE        patch | full (default: patch)
#   SKIP_LOCAL_SYNC    1 = não roda sync-cloud2-to-portal-ibiza.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${PORTAL_IBIZA_DIR:-$HOME/Documents/playeribiza2015-2026/portal-ibiza}"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
REMOTE_DIR="${CLOUD2_APP_DIR:-/opt/portal-ibiza/app}"
INFRA_DIR="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
MODE="${DEPLOY_MODE:-patch}"
SSH=(ssh -o BatchMode=yes)

echo "== Cloud2 deploy (mode=$MODE) → $REMOTE"
echo ""

if [[ "${SKIP_LOCAL_SYNC:-0}" != "1" ]]; then
  echo "== 1/3 Sync .cloud2-stage → portal-ibiza local"
  PORTAL_IBIZA_DIR="$LOCAL" bash "$ROOT/scripts/sync-cloud2-to-portal-ibiza.sh"
else
  echo "== 1/3 Sync local skip"
fi

if [[ "$MODE" == "full" ]]; then
  echo "== 2/3 rsync FULL → $REMOTE:$REMOTE_DIR"
  rsync -avz --delete \
    -e "ssh -o BatchMode=yes" \
    --exclude node_modules \
    --exclude dist \
    --exclude .env \
    "$LOCAL/" "$REMOTE:$REMOTE_DIR/"
elif [[ "$MODE" == "patch" ]]; then
  echo "== 2/3 rsync PATCH → criacao/, workers, rotas gateway"
  rsync -avz -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/criacao/" \
    "$REMOTE:$REMOTE_DIR/src/criacao/"
  rsync -avz --delete -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/workers/criacao/" \
    "$REMOTE:$REMOTE_DIR/src/workers/criacao/"
  for f in ingest.ts audio.ts vinheta.ts publicar.ts enriquecer-tags.ts apagar-musica.ts refresh-tags.ts player-registry.ts publishCronogramas.ts tagEnrichmentCore.ts; do
    rsync -avz -e "ssh -o BatchMode=yes" \
      "$ROOT/.cloud2-stage/$f" \
      "$REMOTE:$REMOTE_DIR/src/routes/criacao/$f"
  done
  rsync -avz -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/criacao-index.ts" \
    "$REMOTE:$REMOTE_DIR/src/routes/criacao/index.ts"
  rsync -avz -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/webservice/getMusica.ts" \
    "$REMOTE:$REMOTE_DIR/src/routes/webservice/getMusica.ts"
  "${SSH[@]}" "$REMOTE" "rm -f '$REMOTE_DIR/src/workers/criacao/pipeline.ts'"
else
  echo "DEPLOY_MODE inválido: $MODE" >&2
  exit 1
fi

echo "== 3/3 Docker rebuild api + worker-audio"
"${SSH[@]}" "$REMOTE" "cd '$INFRA_DIR' && docker compose build api worker-audio && docker compose up -d api worker-audio"

echo ""
echo "OK. Teste sync-registry (401 sem secret = rota existe):"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' -X POST https://cloud2.radioibiza.app.br/criacao/player/sync-registry"
