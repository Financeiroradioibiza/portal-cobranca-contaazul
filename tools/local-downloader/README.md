# Downloader local (yt-dlp)

Baixa músicas **no seu computador** — o portal só resolve metadados (Spotify/lista TXT).

## Por quê?

O servidor da empresa bloqueia download de áudio. O yt-dlp precisa rodar com **IP de usuário**, igual ao `player-preview-2026/worker.py`, mas localmente.

## Requisitos

- Python 3.11+
- ffmpeg no PATH (`brew install ffmpeg`)
- yt-dlp: `pip install -r requirements.txt`

## Uso (macOS)

No Mac, use **`python3`** e **`pip3`** (não existe `python`/`pip` por padrão):

```bash
cd tools/local-downloader
python3 -m pip install --user -r requirements.txt
python3 server.py
```

Ou, em um comando só:

```bash
cd tools/local-downloader
chmod +x start.sh
./start.sh
```

Deixe o terminal aberto enquanto baixa. No portal: **Criação → Upload → Música baixada**.

Se `python3` não existir: `xcode-select --install` (ferramentas de linha de comando da Apple).

## Spotify no portal

Configure no Netlify (só leitura de metadados — **não baixa áudio**):

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

App em https://developer.spotify.com/dashboard

## Fluxo

1. Cole link de playlist Spotify **ou** lista TXT no portal
2. Portal resolve títulos/artistas (API Spotify ou parse local)
3. Portal manda faixas para `http://127.0.0.1:8765`
4. Este app busca no YouTube e salva MP3 em `~/Downloads/RadioIbiza-downloads/`
5. Portal puxa os arquivos e segue para a fila de processamento normal

## Formato TXT (uma faixa por linha)

```
Artista - Título
Madonna - Like a Prayer
```

Linhas com `#` são ignoradas.
