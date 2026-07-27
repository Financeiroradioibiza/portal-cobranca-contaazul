#!/usr/bin/env bash
# Deploy Worker Fase A — audio .rib via Cloudflare (origin B2).
# Uso: bash scripts/deploy-cf-audio-worker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT/cloudflare/audio-b2"
ENV_FILE="$ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: .env.local ou .env com B2_* e CRIACAO_INGEST_SECRET"
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

for v in B2_BUCKET B2_KEY_ID B2_APPLICATION_KEY CRIACAO_INGEST_SECRET; do
  if [[ -z "${!v:-}" ]]; then
    echo "ERRO: variável $v ausente em $ENV_FILE"
    exit 1
  fi
done

B2_ENDPOINT="${B2_ENDPOINT:-${B2_S3_ENDPOINT:-}}"
if [[ -z "$B2_ENDPOINT" ]]; then
  echo "ERRO: B2_ENDPOINT ou B2_S3_ENDPOINT ausente"
  exit 1
fi

B2_KEY_ID="${B2_KEY_ID:-${B2_ACCESS_KEY_ID:-}}"
B2_APPLICATION_KEY="${B2_APPLICATION_KEY:-${B2_SECRET_ACCESS_KEY:-}}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERRO: export CLOUDFLARE_API_TOKEN=... (painel CF → My Profile → API Tokens)"
  exit 1
fi

export CLOUDFLARE_API_TOKEN

echo "== Instalar deps Worker"
cd "$WORKER_DIR"
npm install --no-fund --no-audit

echo "== Secrets Worker (idempotente)"
printf '%s' "$CRIACAO_INGEST_SECRET" | npx wrangler secret put CRIACAO_INGEST_SECRET
printf '%s' "$B2_ENDPOINT" | npx wrangler secret put B2_ENDPOINT
printf '%s' "$B2_BUCKET" | npx wrangler secret put B2_BUCKET
printf '%s' "$B2_KEY_ID" | npx wrangler secret put B2_KEY_ID
printf '%s' "$B2_APPLICATION_KEY" | npx wrangler secret put B2_APPLICATION_KEY

echo "== Deploy"
npx wrangler deploy

echo ""
echo "OK. Próximo: docs/FASE-A-CF-AUDIO-SETUP.md (DNS audio.radioibiza.app.br + curl HEAD)"
