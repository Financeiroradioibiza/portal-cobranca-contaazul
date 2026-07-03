# Cloud2 Downloader — Radio Ibiza

Worker Node.js que roda no VPS cloud2 e processa downloads de música
em fila criados pelo portal (Spotizerr → Deemix → yt-dlp).

## Como funciona

```
Portal (Netlify)
    ↓ cria DownloadJob + DownloadItems no banco
    ↓ POST http://cloud2:3002/process
cloud2-downloader
    ↓ lê itens pendentes do banco
    ↓ chama Spotizerr / Deemix / yt-dlp
    ↓ faz upload do MP3 para R2
    ↓ atualiza status no banco
Portal (UI)
    ↓ mostra arquivo em "Staging"
    ↓ usuário envia para fila de processamento (upload)
```

## Configuração rápida (Docker Compose)

```bash
# 1. Clone o repo ou copie esta pasta para o cloud2
cp .env.example .env
vim .env   # preencha DATABASE_URL, R2_*, CRIACAO_SPOTIZERR_URL, etc.

# 2. Suba os serviços
docker compose up -d

# 3. Configure o Portal (Netlify env vars):
CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL=http://<cloud2-ip>:3002/process
CRIACAO_CLOUD2_DOWNLOAD_SECRET=<mesmo valor que .env>
CRIACAO_SPOTIZERR_URL=http://<cloud2-ip>:7171

# 4. Teste
curl http://localhost:3002/health
# {"ok":true,"version":1}

curl -X POST http://localhost:3002/process \
  -H "Authorization: Bearer <secret>" \
  -H "Content-Type: application/json" \
  -d '{"limit":1}'
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL do banco Neon (mesma do portal) |
| `R2_ENDPOINT` | Ex.: `https://s3.us-west-004.backblazeb2.com` |
| `R2_ACCESS_KEY_ID` | Chave R2/B2 |
| `R2_SECRET_ACCESS_KEY` | Secret R2/B2 |
| `R2_BUCKET` | Nome do bucket |
| `CRIACAO_SPOTIZERR_URL` | URL do Spotizerr (ex.: `http://spotizerr:7171`) |
| `CRIACAO_SPOTIZERR_TOKEN` | Token Bearer do Spotizerr (se configurado) |
| `CRIACAO_DEEMIX_URL` | URL do Deemix (ex.: `http://deemix:6595`) |
| `CRIACAO_YOUTUBE_DL_URL` | URL yt-dlp-server (opcional; se vazio usa CLI) |
| `CRIACAO_DOWNLOAD_STAGING_DIR` | Pasta local onde Spotizerr/Deemix salvam arquivos |
| `PORT` | Porta do worker (padrão: 3002) |
| `CRIACAO_CLOUD2_DOWNLOAD_SECRET` | Bearer token que o portal usa para autenticar |

## Configuração do Spotizerr

O Spotizerr precisa de credenciais Spotify:
- Crie uma conta Spotify Premium
- Configure `spotizerr-config/credentials.json`:

```json
{
  "username": "seu@email.com",
  "password": "senha",
  "blob": ""
}
```

Ou use cookies do Spotify (dependendo da versão do Spotizerr).

## Volume compartilhado

O `docker-compose.yml` configura o volume `spotizerr_data` compartilhado entre
Spotizerr (escrita) e cloud2-downloader (leitura). O worker lê os arquivos
salvos pelo Spotizerr nesse volume.

Configure `CRIACAO_DOWNLOAD_STAGING_DIR` para apontar para o mesmo caminho
onde o Spotizerr salva os downloads (dentro do container).

## Deemix (opcional)

Descomente o serviço `deemix` no `docker-compose.yml` e configure
`CRIACAO_DEEMIX_URL=http://deemix:6595`. Deemix requer ARL (token Deezer)
configurado no painel web do Deemix em `http://localhost:6595`.

## yt-dlp (YouTube)

Se `CRIACAO_YOUTUBE_DL_URL` não estiver configurado, o worker usa o
`yt-dlp` instalado no container (incluído no Dockerfile). Isso funciona
para URLs do YouTube e texto livre (busca automática).
