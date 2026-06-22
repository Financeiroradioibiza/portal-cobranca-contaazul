#!/usr/bin/env bash
# Aplica migration 20260629130000 no Neon quando o build Netlify falhou migrate deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/prisma/migrations/20260629130000_programacao_atualizacao_aberta/migration.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Defina DATABASE_URL (connection string pooled do Neon) e rode de novo." >&2
  exit 1
fi

echo "Aplicando migration atualizacao_aberta…"
npx prisma db execute --file "$SQL" --schema "$ROOT/prisma/schema.prisma"
echo "Registrando migration no _prisma_migrations…"
npx prisma migrate deploy --schema "$ROOT/prisma/schema.prisma"
echo "OK."
