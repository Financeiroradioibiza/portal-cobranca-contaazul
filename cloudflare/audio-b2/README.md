# Worker Cloudflare — áudio `.rib` (Fase A)

Proxy **GET/HEAD** do prefixo `uso/` no bucket B2. **Não substitui** `get_musica` nem altera playlist.

- Auth Fase A: header `x-criacao-secret` (mesmo valor do cloud2 `CRIACAO_INGEST_SECRET`)
- Fase C: URLs assinadas na `url_musica` (mesmo worker/host, auth diferente)

Runbook: `docs/FASE-A-CF-AUDIO-SETUP.md`
