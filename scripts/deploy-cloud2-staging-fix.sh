#!/usr/bin/env bash
# Deploy patch staging Multi-Upload: GC seguro + restore-staging + worker.
# Mais completo que api-dist-hotfix (inclui download-process.ts e worker-audio).
#
#   bash scripts/deploy-cloud2-staging-fix.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${PORTAL_IBIZA_DIR:-$HOME/Documents/playeribiza2015-2026/portal-ibiza}"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
REMOTE_DIR="${CLOUD2_APP_DIR:-/opt/portal-ibiza/app}"
INFRA_DIR="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)

echo "== 1/5 Sync .cloud2-stage → portal-ibiza"
PORTAL_IBIZA_DIR="$LOCAL" bash "$ROOT/scripts/sync-cloud2-to-portal-ibiza.sh"

echo "== 2/5 rsync PATCH staging → servidor"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$ROOT/.cloud2-stage/criacao/" \
  "$REMOTE:$REMOTE_DIR/src/criacao/"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$ROOT/.cloud2-stage/workers/criacao/" \
  "$REMOTE:$REMOTE_DIR/src/workers/criacao/"
for f in download-process.ts ingest-from-staging.ts cleanup-scratch.ts ops-storage.ts; do
  rsync -avz -e "ssh -o BatchMode=yes" \
    "$ROOT/.cloud2-stage/$f" \
    "$REMOTE:$REMOTE_DIR/src/routes/criacao/$f"
done

echo "== 3/5 npm run build (api + worker dist no Mac)"
(cd "$LOCAL" && npm run build:api)

echo "== 4/5 Enviar dist → api + worker-audio + restart"
STAGING="dist-staging-fix-$$"
rsync -avz -e "ssh -o BatchMode=yes" \
  "$LOCAL/dist/" \
  "$REMOTE:$REMOTE_DIR/$STAGING/"

"${SSH[@]}" "$REMOTE" "set -e
  cd '$INFRA_DIR'
  API=\$(docker compose ps -q api)
  WRK=\$(docker compose ps -q worker-audio)
  if [ -z \"\$API\" ]; then echo 'Container api não encontrado'; exit 1; fi
  docker cp '$REMOTE_DIR/$STAGING/.' \"\$API\":/app/dist/
  if [ -n \"\$WRK\" ]; then docker cp '$REMOTE_DIR/$STAGING/.' \"\$WRK\":/app/dist/; fi
  rm -rf '$REMOTE_DIR/$STAGING'
  docker compose restart api worker-audio
  sleep 4
  docker compose ps api worker-audio
"

echo ""
echo "== 5/5 Verificar restore-staging (401 sem Bearer = rota existe)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "https://cloud2.radioibiza.app.br/criacao/download/restore-staging" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test"}' || echo "000")
echo "POST /criacao/download/restore-staging → HTTP $CODE"
if [[ "$CODE" != "401" && "$CODE" != "403" && "$CODE" != "200" ]]; then
  echo "AVISO: esperado 401/403 (auth) — se 404, deploy incompleto."
  exit 1
fi

echo ""
echo "OK staging fix. No portal: Multi-Upload → «Recuperar MP3» (ou abrir de novo — tenta disco automaticamente)."
