#!/usr/bin/env bash
# build.sh — copia o schema do portal e constrói a imagem Docker
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_SCHEMA="$SCRIPT_DIR/../../prisma/schema.prisma"

mkdir -p "$SCRIPT_DIR/prisma"
cp "$PORTAL_SCHEMA" "$SCRIPT_DIR/prisma/schema.prisma"
echo "✅ schema.prisma copiado"

docker build -t cloud2-downloader:latest "$SCRIPT_DIR"
echo "✅ Imagem cloud2-downloader:latest construída"
