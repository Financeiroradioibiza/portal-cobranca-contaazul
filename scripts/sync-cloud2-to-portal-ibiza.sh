#!/usr/bin/env bash
# Copia .cloud2-stage/ → portal-ibiza/src/ (deploy local antes de rsync ao Envyron).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.cloud2-stage"
DEST="${PORTAL_IBIZA_DIR:-$HOME/Documents/playeribiza2015-2026/portal-ibiza}"

if [[ ! -d "$SRC" ]]; then
  echo "Erro: $SRC não encontrado" >&2
  exit 1
fi
if [[ ! -d "$DEST" ]]; then
  echo "Erro: portal-ibiza não encontrado em $DEST" >&2
  echo "Defina PORTAL_IBIZA_DIR=/caminho/portal-ibiza" >&2
  exit 1
fi

echo "Sync: $SRC → $DEST/src"

mkdir -p "$DEST/src/criacao" "$DEST/src/routes/criacao" "$DEST/src/routes/webservice" "$DEST/src/workers/criacao" "$DEST/src/workers"

rsync -a --delete "$SRC/criacao/" "$DEST/src/criacao/"
rsync -a "$SRC/workers/criacao/" "$DEST/src/workers/criacao/"
if [[ -f "$SRC/workers/index.ts" ]]; then
  cp "$SRC/workers/index.ts" "$DEST/src/workers/index.ts"
fi
if [[ -f "$SRC/deploy/tsconfig.json" ]]; then
  cp "$SRC/deploy/tsconfig.json" "$DEST/tsconfig.json"
fi
rsync -a "$SRC/webservice/" "$DEST/src/routes/webservice/"

for f in ingest.ts ingest-from-staging.ts audio.ts upload-audio.ts download-process.ts vinheta.ts publicar.ts enriquecer-tags.ts apagar-musica.ts refresh-tags.ts reprocess-edicao.ts reanalisar-mix-trim.ts player-registry.ts publishCronogramas.ts tagEnrichmentCore.ts ops-storage.ts cleanup-scratch.ts atualizacaoPendentePulse.ts; do
  cp "$SRC/$f" "$DEST/src/routes/criacao/$f"
done
cp "$SRC/criacao-index.ts" "$DEST/src/routes/criacao/index.ts"

cp "$SRC/routes/loginByToken.js" "$DEST/src/routes/loginByToken.js"
cp "$SRC/webservice-index.ts" "$DEST/src/routes/index.ts"

# .ts legados sobrescrevem o build e ignoram estes .js corrigidos
rm -f \
  "$DEST/src/routes/webservice/playlist.ts" \
  "$DEST/src/routes/webservice/loginByToken.ts"

echo "OK — rode em $DEST:"
echo "  npm install"
echo "  npm run build"
echo "  npm run start          # API"
echo "  npm run start:worker:criacao   # pipeline LUFS"
