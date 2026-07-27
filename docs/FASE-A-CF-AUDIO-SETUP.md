# Fase A — Cloudflare + B2 (entrega `.rib`, zero impacto produção)

**Plano geral:** `docs/PLANO-PLAYER5-ENTREGA-CF-B2-RIB.md`

Objetivo desta fase: infra de borda pronta para homologar `.rib` via Cloudflare **sem** mudar player, playlist, pipeline nem publicação.

---

## O que esta fase faz / não faz

| Faz | Não faz |
|-----|---------|
| Worker CF → GET `.rib` no B2 (Bandwidth Alliance) | Alterar `/api/playlist/` ou `url_musica` |
| Domínio `cloud3.radioibiza.app.br` (quando DNS ok) | Desligar `get_musica` |
| CORS no bucket B2 (origens player/portal/audio) | Player v2 / presign na playlist |
| Teste ops: HEAD/GET com `x-criacao-secret` | Gravar MP3 no cache ou decrypt na borda |

---

## Pré-requisitos

1. **Backblaze B2** — bucket `radioibiza-masters-2026`, prefixo `uso/` com `.rib` (já homologado).
2. **Bandwidth Alliance** — **não há botão no painel B2.** A parceria Backblaze↔Cloudflare é automática: egress **B2 → rede Cloudflare** = $0 no B2. Basta o tráfego passar pelo Worker/CDN CF (nosso desenho). Ver [Cloudflare Integrations (Backblaze)](https://www.backblaze.com/docs/cloud-storage-cloudflare-integrations).
3. **Conta Cloudflare** — API token com *Workers Scripts* + *Workers Routes* (e DNS se zona estiver na CF).
4. **Segredo** — mesmo `CRIACAO_INGEST_SECRET` do cloud2 (só ops/Fase A; Fase C usa URL assinada).

---

## Passo 1 — CORS no bucket B2

No Mac (`.env` com `B2_*`):

```bash
npx tsx scripts/apply-b2-cors.ts --dry-run
npx tsx scripts/apply-b2-cors.ts
```

Origens: `player5.radioibiza.app.br`, `portal.radioibiza.app.br`, `cloud3.radioibiza.app.br`.

---

## Passo 2 — Deploy do Worker

```bash
bash scripts/deploy-cf-audio-worker.sh
```

O script:

1. Instala deps em `cloudflare/audio-b2/`
2. Pede/confere `CLOUDFLARE_API_TOKEN`
3. Sincroniza secrets B2 + ingest a partir do `.env` local
4. `wrangler deploy`

**Secrets no Worker:**

| Secret | Origem |
|--------|--------|
| `CRIACAO_INGEST_SECRET` | = cloud2 |
| `B2_ENDPOINT` | ex. `https://s3.us-east-005.backblazeb2.com` |
| `B2_BUCKET` | `radioibiza-masters-2026` |
| `B2_KEY_ID` | Application Key ID |
| `B2_APPLICATION_KEY` | secret da key |

Variável opcional: `CORS_ALLOWED_ORIGINS` (vírgula).

---

## Passo 3 — DNS `cloud3.radioibiza.app.br`

Naming: **cloud2** = comando/API (Envyron); **cloud3** = entrega de áudio na borda CF (Worker → B2).

`radioibiza.app.br` hoje usa NS do **Registro.br** (`f.sec.dns.br`). Duas opções:

### A) Subdomínio via Registro.br (recomendado agora)

1. No painel Cloudflare Workers → *radioibiza-audio-b2* → **Custom Domains** → adicionar `cloud3.radioibiza.app.br`.
2. A CF mostra o **target** do CNAME (ex. `radioibiza-audio-b2.<account>.workers.dev` ou registro específico).
3. No **Registro.br**, criar **CNAME** `audio` → target indicado pela CF.

### B) Zona inteira na Cloudflare (futuro)

Migrar NS de `radioibiza.app.br` para Cloudflare — fora do escopo Fase A salvo OK explícito.

---

## Passo 4 — Homolog (ops)

Faixa teste hiphop (ex. Shaggy):

```
Object key: uso/musicas/cf85f05e-05be-43b8-8e72-f79b1240e296/mp3_128_mono.rib
```

**Via workers.dev** (Fase A — deploy 2026-07-27):

```
https://radioibiza-audio-b2.radioibiza-audio.workers.dev/uso/musicas/{id}/mp3_128_mono.rib
```

**Antes do DNS** (URL antiga de exemplo):

```bash
curl -sI \
  -H "x-criacao-secret: SEU_CRIACAO_INGEST_SECRET" \
  "https://radioibiza-audio-b2.<subdominio-workers>.workers.dev/uso/musicas/cf85f05e-05be-43b8-8e72-f79b1240e296/mp3_128_mono.rib"
```

Esperado: `HTTP/2 200`, `content-type: application/octet-stream`, tamanho ~3,8 MB.

**Via domínio final:**

```bash
curl -sI \
  -H "x-criacao-secret: SEU_CRIACAO_INGEST_SECRET" \
  "https://cloud3.radioibiza.app.br/uso/musicas/cf85f05e-05be-43b8-8e72-f79b1240e296/mp3_128_mono.rib"
```

**Player / playlist:** inalterados — PDVs continuam em `get_musica`.

---

## Rollback Fase A

1. Remover custom domain ou pausar Worker no painel CF.
2. Remover CNAME `audio` no Registro.br (opcional).
3. CORS B2 pode permanecer (inofensivo).

Nenhum impacto em fila, publicação ou Player v1.

---

## Checklist Fase A

- [ ] ~~Bandwidth Alliance no painel B2~~ — **não existe**; aliança ativa quando o Worker CF busca no B2 (deploy + DNS)
- [x] CORS B2 aplicado (`2026-07-27` — bucket `radioibiza-masters-2026`)
- [x] Worker deployado + secrets ok (`radioibiza-audio-b2.radioibiza-audio.workers.dev`)
- [ ] CNAME **`cloud3`** no Registro.br → custom domain no painel CF
- [ ] HEAD 200 num `.rib` real via domínio CF
- [ ] Player v1 piloto ainda toca via `get_musica` (regressão zero)

---

## Próximo (Fase B/C — outro PR)

- Flag `PLAYER5_ENTREGA_CF=0` no cloud2
- Presign / token na `/api/playlist/` para Player v2
- Ver `docs/PLANO-PLAYER5-ENTREGA-CF-B2-RIB.md`
