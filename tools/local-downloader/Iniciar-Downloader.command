#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  Radio Ibiza — Downloader local (yt-dlp)"
echo "  ======================================="
echo ""

if ! command -v python3 >/dev/null 2>&1; then
  echo "  [ERRO] python3 não encontrado."
  echo "  Instale: xcode-select --install"
  echo "  Ou: brew install python"
  echo ""
  read -r -p "Pressione Enter para fechar..."
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "  [AVISO] ffmpeg não encontrado — downloads podem falhar."
  echo "  Instale: brew install ffmpeg"
  echo ""
fi

echo "  Usando: $(python3 --version)"
echo ""
echo "  Instalando/atualizando yt-dlp..."
python3 -m pip install --user -r requirements.txt || {
  echo ""
  echo "  [ERRO] Falha ao instalar dependências."
  read -r -p "Pressione Enter para fechar..."
  exit 1
}

echo ""
echo "  Servidor em https://127.0.0.1:8765"
echo "  MP3s em ~/Downloads/RadioIbiza-downloads"
echo ""
echo "  PRIMEIRA VEZ: abra https://127.0.0.1:8765/health no navegador"
echo "  e aceite o certificado. Depois recarregue o portal."
echo ""
echo "  Deixe ESTA JANELA ABERTA enquanto usa o portal:"
echo "  Criação → Upload → Música baixada"
echo ""
echo "  Para encerrar: feche esta janela ou Ctrl+C"
echo ""

exec python3 server.py
