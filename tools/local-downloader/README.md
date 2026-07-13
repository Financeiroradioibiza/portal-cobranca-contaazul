# Downloader local (yt-dlp)

> **Pausado no portal** — a opção “Música baixada” foi retirada da tela de Upload por enquanto.
> O código permanece aqui para uso futuro (SpotiFLAC / yt-dlp local).

Baixa músicas **no seu computador** — o portal só resolve metadados (lista TXT).

## Por quê?

O servidor da empresa bloqueia download de áudio. O yt-dlp precisa rodar com **IP de usuário**, igual ao `player-preview-2026/worker.py`, mas localmente.

## Requisitos

- Python 3.11+
- ffmpeg no PATH (`brew install ffmpeg`)
- yt-dlp: `pip install -r requirements.txt`

## Uso rápido (duplo clique)

**Windows:** dê duplo clique em `Iniciar-Downloader.bat`  
**Mac:** dê duplo clique em `Iniciar-Downloader.command`  
(na primeira vez no Mac: botão direito → Abrir, se o sistema bloquear)

Deixe a janela aberta. No portal: **Criação → Upload → Música baixada**.

**Primeira vez:** abra [https://127.0.0.1:8765/health](https://127.0.0.1:8765/health) no navegador, aceite o certificado local e recarregue o portal. (O site em HTTPS não consegue falar com `http://` local — por isso usamos HTTPS aqui.)

### Requisitos (uma vez por PC)

| | Windows | Mac |
|---|---------|-----|
| Python 3 | [python.org](https://www.python.org/downloads/) — marque **Add to PATH** | `xcode-select --install` ou `brew install python` |
| ffmpeg | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |

## Uso pelo terminal (opcional)

```bash
cd tools/local-downloader
./start.sh          # Mac/Linux
# ou Iniciar-Downloader.bat no Windows
```

## Fluxo

1. Exporte a playlist como TXT (Soundiiz/TuneMyMusic) ou monte «Artista - Título» manualmente
2. Portal faz parse local da lista
3. Portal manda faixas para `http://127.0.0.1:8765`
4. Este app busca no YouTube e salva MP3 em `~/Downloads/RadioIbiza-downloads/`
5. Portal puxa os arquivos e segue para a fila de processamento normal

## Formato TXT (uma faixa por linha)

```
Artista - Título
Madonna - Like a Prayer
```

Linhas com `#` são ignoradas.
