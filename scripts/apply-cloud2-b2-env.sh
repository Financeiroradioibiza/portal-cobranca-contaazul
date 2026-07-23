#!/usr/bin/env bash
# Mescla B2_* de .cloud2-secrets/b2.env no .env do cloud2 (Envyron) e reinicia api + worker-audio.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS="$ROOT/.cloud2-secrets/b2.env"
REMOTE="${CLOUD2_HOST:-radioibiza@cloudserver165.envyron.cloud}"
INFRA="${CLOUD2_INFRA_DIR:-/opt/portal-ibiza/infra}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15)

if [[ ! -f "$SECRETS" ]]; then
  echo "Crie $SECRETS a partir de .cloud2-secrets/b2.env.example (Application Key da Backblaze)."
  exit 1
fi

# shellcheck disable=SC1090
source "$SECRETS"

for v in B2_S3_ENDPOINT B2_REGION B2_BUCKET B2_KEY_ID B2_APPLICATION_KEY; do
  if [[ -z "${!v:-}" ]]; then
    echo "Falta $v em $SECRETS"
    exit 1
  fi
done

B2_MASTER_PREFIX="${B2_MASTER_PREFIX:-master/}"
B2_USO_PREFIX="${B2_USO_PREFIX:-uso/}"

BLOCK="# --- Backblaze B2 masters (pipeline criação — obrigatório) ---
B2_S3_ENDPOINT=${B2_S3_ENDPOINT}
B2_REGION=${B2_REGION}
B2_BUCKET=${B2_BUCKET}
B2_MASTER_PREFIX=${B2_MASTER_PREFIX}
B2_USO_PREFIX=${B2_USO_PREFIX}
B2_KEY_ID=${B2_KEY_ID}
B2_APPLICATION_KEY='${B2_APPLICATION_KEY//\'/\'\\\'\'}'
CRIACAO_USO_B2=${CRIACAO_USO_B2:-0}
CRIACAO_USO_DISK_MIRROR=${CRIACAO_USO_DISK_MIRROR:-1}
"

echo "== Atualizando B2 no $REMOTE:$INFRA/.env"
"${SSH[@]}" "$REMOTE" "grep -q '^B2_BUCKET=' '$INFRA/.env' 2>/dev/null && sed -i.bak.b2-\$(date +%s) '/^B2_/d' '$INFRA/.env' || true"
printf '%s\n' "$BLOCK" | "${SSH[@]}" "$REMOTE" "cat >> '$INFRA/.env'"

echo "== Reiniciando api + worker-audio"
"${SSH[@]}" "$REMOTE" "cd '$INFRA' && docker compose up -d api worker-audio"

echo "== Verificação (sem mostrar secrets)"
"${SSH[@]}" "$REMOTE" "cd '$INFRA' && docker compose exec -T worker-audio node -e \"\
const { b2Enabled } = require('./dist/criacao/config.js');\
console.log('b2Enabled=', b2Enabled());\
\""

echo "OK. Processe 1 faixa teste; confira master/ e uso/ no bucket; npm run criacao:audit-b2 -- --musica=ID"
