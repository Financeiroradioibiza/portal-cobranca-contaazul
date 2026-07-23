#!/usr/bin/env bash
# Deploy rápido da API cloud2: compila dist no Mac e injeta no container (sem rebuild Docker/ffmpeg).
# Use quando `docker compose build api` trava em `apk add ffmpeg`.
#
# Requisito: portal-ibiza local (sync .cloud2-stage antes).
#
#   bash scripts/deploy-cloud2-api-dist-hotfix.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${PORTAL_IBIZA_DIR:-$HOME/Documents/playeribiza2015-2026/portal-ibiza}"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
REMOTE_DIR="${CLOUD2_APP_DIR:-/opt/portal-ibiza/app}"
INFRA_DIR="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)

echo "== 1/4 Sync .cloud2-stage → portal-ibiza"
PORTAL_IBIZA_DIR="$LOCAL" bash "$ROOT/scripts/sync-cloud2-to-portal-ibiza.sh"

echo "== 2/4 rsync PATCH (src) → servidor"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$ROOT/.cloud2-stage/criacao/" \
  "$REMOTE:$REMOTE_DIR/src/criacao/"
for f in ops-storage.ts atualizacaoPendentePulse.ts; do
  rsync -avz -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/$f" \
    "$REMOTE:$REMOTE_DIR/src/routes/criacao/$f"
done

echo "== 3/4 npm run build:api (local Mac)"
(cd "$LOCAL" && npm run build:api)

echo "== 4/4 Enviar dist (Mac) → container api + restart"
STAGING="dist-hotfix-$$"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$LOCAL/dist/" \
  "$REMOTE:$REMOTE_DIR/$STAGING/"

"${SSH[@]}" "$REMOTE" "set -e
  cd '$INFRA_DIR'
  CID=\$(docker compose ps -q api)
  if [ -z \"\$CID\" ]; then echo 'Container api não encontrado'; exit 1; fi
  docker cp '$REMOTE_DIR/$STAGING/.' \"\$CID\":/app/dist/
  rm -rf '$REMOTE_DIR/$STAGING'
  docker compose restart api
  sleep 3
  docker compose ps api
"

echo ""
echo "OK hotfix. Teste:"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' https://cloud2.radioibiza.app.br/criacao/ops/b2-verify/test"
echo "(401 = rota existe)"
