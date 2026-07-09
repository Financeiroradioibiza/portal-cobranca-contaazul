#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  Radio Ibiza — Servidor UP (migração legado)"
echo "  ============================================"
echo ""

if ! command -v python3 >/dev/null 2>&1; then
  echo "  [ERRO] python3 não encontrado."
  echo "  Instale: xcode-select --install  ou  brew install python"
  echo ""
  read -r -p "Pressione Enter para fechar..."
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "  [AVISO] ffprobe não encontrado — duração das faixas ficará vazia."
  echo "  Instale: brew install ffmpeg"
  echo ""
fi

echo "  Usando: $(python3 --version)"
echo ""
echo "  Servidor em https://127.0.0.1:8766"
echo ""
echo "  PRIMEIRA VEZ: abra https://127.0.0.1:8766/health no navegador"
echo "  e aceite o certificado. Depois recarregue o portal."
echo ""
echo "  Portal: Criação → Servidor UP"
echo ""
echo "  Deixe ESTA JANELA ABERTA durante a migração."
echo ""

exec python3 server.py
