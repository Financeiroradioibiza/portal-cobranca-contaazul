#!/usr/bin/env bash
# Backup local dos projetos Radio Ibiza (código, sem node_modules).
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${HOME}/Documents/backups-radio-ibiza"
ARCHIVE="${DEST}/radio-ibiza-backup-${STAMP}.tar.gz"
DOCS="${HOME}/Documents"

mkdir -p "$DEST"

ITEMS=(portal-cobranca-contaazul)
[[ -d "${DOCS}/playeribiza2015-2026" ]] && ITEMS+=(playeribiza2015-2026)
[[ -d "${DOCS}/radioibiza-legacy-www" ]] && ITEMS+=(radioibiza-legacy-www)

echo "A criar backup em: ${ARCHIVE}"
echo "Pastas: ${ITEMS[*]}"

tar -czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.rio-marca-layout.run.cjs' \
  --exclude='.rio-revert-sync.run.cjs' \
  -C "$DOCS" \
  "${ITEMS[@]}"

ls -lh "$ARCHIVE"
echo "OK — backup concluído."
