#!/usr/bin/env bash
# Deploy manual do portal → https://portal.radioibiza.app.br
# Site Netlify: site-vencidos-ibiza (NÃO usar outro site / subdomain aleatório).
#
# Preferência: git push origin main (CI Netlify já ligado ao GitHub).
# Este script só para deploy manual de emergência via CLI.
#
#   bash scripts/deploy-netlify-portal.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# site-vencidos-ibiza → portal.radioibiza.app.br + site-vencidos-ibiza.netlify.app
EXPECTED_SITE_ID="0107bc8a-2d4c-4c8f-a33f-8132779d9aee"
FORBIDDEN_SITE_ID="6b684409-fd62-4173-b439-068ca6b9fa05"

STATE=".netlify/state.json"
if [[ ! -f "$STATE" ]]; then
  echo "ERRO: projeto não linkado ao Netlify. Rode:"
  echo "  netlify link --id $EXPECTED_SITE_ID"
  exit 1
fi

LINKED="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$STATE','utf8')).siteId||'')")"
if [[ "$LINKED" == "$FORBIDDEN_SITE_ID" ]]; then
  echo "ERRO: link aponta para site errado (delightful-jelly). Corrija:"
  echo "  netlify link --id $EXPECTED_SITE_ID"
  exit 1
fi
if [[ "$LINKED" != "$EXPECTED_SITE_ID" ]]; then
  echo "ERRO: site linkado ($LINKED) não é site-vencidos-ibiza ($EXPECTED_SITE_ID)."
  echo "  netlify link --id $EXPECTED_SITE_ID"
  exit 1
fi

echo "== Deploy portal.radioibiza.app.br (site-vencidos-ibiza)"
netlify deploy --prod
