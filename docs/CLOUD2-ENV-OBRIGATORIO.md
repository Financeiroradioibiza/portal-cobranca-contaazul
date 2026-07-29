# Cloud2 (Envyron) — variáveis obrigatórias e opcionais

Arquivo no servidor: **`/opt/portal-ibiza/infra/.env`**  
Usado por **`api`** e **`worker-audio`** (`env_file: .env`).

## Pipeline acordado (não alterar sem OK)

Toda faixa na fila: dedupe → mix → LUFS → tags → **128 mono no B2 (`B2_USO_PREFIX`)** + espelho opcional no NVMe → **master 192k no Backblaze B2**. Cada upload B2 confirma com **HeadObject** (tamanho).

**Baseline produção (jul/2026+):** 128 no **B2** (`CRIACAO_USO_B2=1`, chave `b2:`) + entrega player via **cloud3** (piloto/expansão). Espelho NVMe **desligado** (`CRIACAO_USO_DISK_MIRROR=0`). Ver `docs/PLANO-ZERO-USO-DISCO-DO.md`. Legado disco `uso:` — `docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`.

## Backblaze B2 — **obrigatório** em produção

| Variável | Exemplo |
|----------|---------|
| `B2_S3_ENDPOINT` ou `B2_ENDPOINT` | **Copiar do bucket** no painel B2 (ex. `https://s3.us-east-005.backblazeb2.com`) |
| `B2_REGION` | Mesma região do endpoint (ex. `us-east-005`) |
| `B2_BUCKET` | `radioibiza-masters-2026` |
| `B2_KEY_ID` | Application Key ID (Backblaze) |
| `B2_APPLICATION_KEY` | secret da key |
| `B2_MASTER_PREFIX` | `master/` (prefixo no bucket; manter igual ao já usado) |
| `B2_USO_PREFIX` | `uso/` (128 mono / .rib no mesmo bucket) |

| Variável | Default | Papel |
|----------|---------|--------|
| `CRIACAO_USO_B2` | **`0`** | **`1` em homolog/prod atual** — grava 128 no B2 (`b2:` no Neon). **`0` = rollback (disco `uso:`)** |
| `CRIACAO_USO_DISK_MIRROR` | `1` | **`0` recomendado** — sem cópia permanente em `uso/` no NVMe (preview/player via B2). **`1` = rollback legado** |
| `CRIACAO_WORKER_CONCURRENCY` | `1` | Faixas em paralelo no worker (`2` = duas no Kanban ao mesmo tempo; max 8) |

### Auditar chegada no B2

- Cloud2: `GET /criacao/ops/b2-verify/:musicaId` e `GET /criacao/ops/b2-audit?limit=500` (header `x-criacao-secret`).
- Mac/CI: `npm run criacao:audit-b2` (ver `docs/PLANO-B2-128-PASSOS.md`).

Sem `B2_*`, o worker **não deve** gravar masters só no disco em produção (ver `CRIACAO_ALLOW_LOCAL_MASTER`).

Após editar:

```bash
cd /opt/portal-ibiza/infra
docker compose up -d api worker-audio
```

## Cloudflare R2 — **opcional**

Cópia **extra** das versões de **uso** (128 mono / .rib) na Cloudflare — **não** substitui o disco cloud2 nem o B2.

| Variável | Papel |
|----------|--------|
| `R2_ENDPOINT` | URL S3 API do R2 |
| `R2_BUCKET` | ex. `radioibiza-criacao` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | token R2 |

Se `R2_*` estiver vazio, o painel **Servidores** mostra R2 offline — **normal**; o player continua usando `uso/` no NVMe.

## Portal Netlify

| Variável | Papel |
|----------|--------|
| `CRIACAO_INGEST_SECRET` | Igual ao cloud2 — ingest, preview, **`npm run criacao:audit-b2`** |
| `CRIACAO_CLOUD2_INGEST_URL` | Opcional; default `https://cloud2.radioibiza.app.br/criacao/ingest` |

**Audit no Mac:** copie `CRIACAO_INGEST_SECRET` do Netlify (ou do `.env` Envyron) para **`.env.local`** na raiz do repo (gitignored). Não commite o secret.

B2 **não** vai no Netlify; só no cloud2.

## Cloudflare entrega áudio (Fase A — opt-in, não altera player)

Worker `cloudflare/audio-b2/` — ver **`docs/FASE-A-CF-AUDIO-SETUP.md`**.

| Onde | Variável | Papel |
|------|----------|--------|
| Mac deploy Worker | `CLOUDFLARE_API_TOKEN` | API token CF (Workers) |
| Worker secrets | `CRIACAO_INGEST_SECRET`, `B2_*` | Iguais ao cloud2 |
| cloud2 (fase C) | `PLAYER5_ENTREGA_CF` | **Default `1`** (cloud3). Rollback consciente: **`=0`** → get_musica |
| cloud2 (fase C) | `CF_AUDIO_DOMAIN=cloud3.radioibiza.app.br` | Host na URL assinada |
| cloud2 (fase C) | `CF_AUDIO_SIGN_TTL_SEC=3600` | Validade da assinatura (segundos) |
| cloud2 (fase C) | `PLAYER5_ENTREGA_CF_PDV_IDS=` | Opcional — piloto por ID; **vazio = todos os PDVs cloud2** |
| cloud2 (fase C) | `CRIACAO_USO_PUBLIC_RIB_BASENAME=msk` | Nome na URL cloud3 (`msk.rib`); B2 interno pode continuar `mp3_128_mono.rib` |

Com `PLAYER5_ENTREGA_CF=1`, **todo PDV no webservice cloud2** recebe `url_musica` em `cloud3` (Player 4 permanece em `cloud.radioibiza.com.br`). Rollback: `PLAYER5_ENTREGA_CF=0`.

## Aplicar B2 a partir do Mac (sem colar secrets no chat)

1. Crie arquivo local **gitignored**: `.cloud2-secrets/b2.env` (veja `.cloud2-secrets/b2.env.example`).
2. Rode: `bash scripts/apply-cloud2-b2-env.sh`

## Masters só no disco (incidente jun–jul/2026)

Se `B2_*` sumiu do `.env`, o pipeline gravou ~500+ masters em `master-local/`. Reativar B2 **não reenvia** automaticamente — planejar script de backfill separado.
