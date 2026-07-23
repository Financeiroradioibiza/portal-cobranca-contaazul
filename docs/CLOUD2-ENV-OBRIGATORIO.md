# Cloud2 (Envyron) — variáveis obrigatórias e opcionais

Arquivo no servidor: **`/opt/portal-ibiza/infra/.env`**  
Usado por **`api`** e **`worker-audio`** (`env_file: .env`).

## Pipeline acordado (não alterar sem OK)

Toda faixa na fila: dedupe → mix → LUFS → tags → **128 mono no B2 (`B2_USO_PREFIX`)** + espelho opcional no NVMe → **master 192k no Backblaze B2**. Cada upload B2 confirma com **HeadObject** (tamanho).

**Baseline produção (Player + preview):** 128 no **disco** `uso/` e chave **`uso:`** — ver `docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`. Migração 128→B2 só com `CRIACAO_USO_B2=1` após homolog.

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
| `CRIACAO_USO_B2` | **`0`** | **`1` só após homolog** — grava 128 no B2 (`b2:` no Neon). **`0` = baseline (disco `uso:` + player/publicar como hoje)** |
| `CRIACAO_USO_DISK_MIRROR` | `1` | **Manter `1` em prod** — cópia `uso/` para preview portal e fallback do player |

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

## Aplicar B2 a partir do Mac (sem colar secrets no chat)

1. Crie arquivo local **gitignored**: `.cloud2-secrets/b2.env` (veja `.cloud2-secrets/b2.env.example`).
2. Rode: `bash scripts/apply-cloud2-b2-env.sh`

## Masters só no disco (incidente jun–jul/2026)

Se `B2_*` sumiu do `.env`, o pipeline gravou ~500+ masters em `master-local/`. Reativar B2 **não reenvia** automaticamente — planejar script de backfill separado.
