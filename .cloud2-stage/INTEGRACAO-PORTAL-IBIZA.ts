/**
 * Deploy pipeline LUFS (portal-ibiza / cloud2)
 *
 * Local (Mac):
 *   bash scripts/sync-cloud2-to-portal-ibiza.sh
 *   cd ~/Documents/playeribiza2015-2026/portal-ibiza && npm install && npm run build
 *
 * Servidor (Envyron):
 *   CLOUD2_HOST=root@IP bash scripts/deploy-cloud2-lufs.sh
 *
 * PM2 no servidor:
 *   portal-ibiza-api              → dist/index.js
 *   portal-ibiza-criacao-worker   → dist/workers/criacao/index.js  (LUFS + transcode)
 *
 * .env no servidor (além do DATABASE_URL do gateway):
 *   PORTAL_DATABASE_URL=…neon…
 *   CRIACAO_INGEST_SECRET=… (igual Netlify)
 *   CRIACAO_STORAGE_ROOT=/var/lib/portal-ibiza/criacao
 *   B2_ENDPOINT, B2_BUCKET, B2_KEY_ID, B2_APPLICATION_KEY
 *
 * Pré-requisito: ffmpeg + ffprobe no PATH
 */

export {};
