# Baseline — Portal + Player 5 (armazenamento de música)

**Data de referência:** jul/2026 (antes da migração opt-in do 128 para B2).  
**Objetivo:** registrar como **produção funciona hoje**, para comparar deploys e acionar fallback sem “quebrar tudo”.

Documentos irmãos:

- Rollback rápido: `docs/FALLBACK-ARMAZENAMENTO-B2.md`
- Plano da migração: `docs/PLANO-B2-128-PASSOS.md`

---

## Regra de ouro (não regredir)

1. **Player 5 em produção** continua no contrato abaixo até existir **Player 5 v2** homologado + OK explícito para trocar URL de download.
2. **Portal preview** continua via **cloud2** (`/criacao/audio`) enquanto não houver fase CDN/B2 no Netlify.
3. **Faixas já publicadas** no gateway usam o `storage_key` copiado na publicação — mudar Neon **não** altera o player até **republicar / disparar atualização**.

---

## Fluxo end-to-end hoje (produção)

```
Portal (Neon)          cloud2 worker           NVMe cloud2          Backblaze B2
─────────────          ─────────────           ───────────          ────────────
Fila processamento  →  pipeline              uso/musicas/…        master/{id}.mp3
Biblioteca preview  →  GET /criacao/audio  →  lê disco uso/      (não toca preview)
Publicar prog.      →  publicar.ts         →  storage_key no     —
Player 5            →  GET /api/get_musica →  gateway PG         —
                       resolve uso: disco
```

---

## Onde cada peça lê o áudio

| Consumidor | URL / rota | Fonte do MP3 | Chave no banco |
|------------|------------|--------------|----------------|
| **Portal** — biblioteca, edição, wizard, duplicata | `buildPreviewUrl` → cloud2 **`/criacao/audio/:musicaId`** (HMAC `CRIACAO_INGEST_SECRET`) | Disco **`/var/lib/…/uso/musicas/{id}/`** (`.rib` ou `.mp3`) | Não consulta Neon na rota; tenta paths `uso:musicas/…` no disco |
| **Player 5** — playlist | **`/api/get_musica/?token=&id_musica=`** | Disco cloud2 via **`musicas.storage_key`** no Postgres **gateway** | Copiado de `musica_versao.storage_key` na **publicação** (formato **`uso:musicas/{id}/mp3_128_mono…`**) |
| **Reprocess trim** | cloud2 job | Lê **master** B2 (ou `local:`) → regrava **uso/** disco | Atualiza `musica_versao` com chave **`uso:…`** |
| **Master frio** | Reprocess / futuro transcode | Download S3 B2 | `musica_biblioteca.master_storage_key` = `master/{id}.mp3` (ou `local:` se incidente) |

Código portal preview: `lib/criacao/streamUrl.ts`  
Código player entrega: `.cloud2-stage/webservice/getMusica.ts` + `.cloud2-stage/criacao/audioDelivery.ts`  
Publicação: `.cloud2-stage/publicar.ts` (copia `storage_key` para tabela gateway `musicas`)

---

## Formato de chaves (Neon) — baseline

| Campo | Valor típico hoje |
|-------|-------------------|
| `musica_biblioteca.master_storage_key` | `master/{cuid}.mp3` no B2 (quando env ok) |
| `musica_versao.storage_key` (mp3_128_mono) | **`uso:musicas/{cuid}/mp3_128_mono.rib`** ou `.mp3` |
| Gateway `musicas.storage_key` | Igual ao da versão **no momento da publicação** |

Prefixo físico disco: `{CRIACAO_STORAGE_ROOT}/uso/musicas/{musicaId}/`  
Helpers: `.cloud2-stage/criacao/storage.ts` (`usoStorageKey`, `usoPath`)

---

## Pipeline da fila (comportamento baseline)

Ordem inalterada: ingest → dedupe → mix → LUFS → tags → **armazenamento**:

1. **Master 192** → B2 (`uploadMasterToB2` + verify HeadObject após deploy recente).
2. **128 mono** → empacota (`.rib` se `CRIACAO_RIB_SECRET`) → grava **`uso/` no NVMe**.
3. **`musica_versao`** → chave **`uso:…`** (enquanto `CRIACAO_USO_B2=0`).
4. Cópia **R2** opcional (não substitui disco nem player).

Player **não** baixa do B2 nem do Netlify hoje.

---

## Player 5 — contrato que não pode mudar sem nova versão

- Login / playlist / ping / cronogramas: ver `docs/PLAYER5-INTEGRACAO.md`.
- Cada faixa na playlist traz **`url_musica`** apontando para **`get_musica`** no cloud2 (mesmo host do webservice).
- **`get_musica`** valida token + autorização → lê **`storage_key`** → **`resolveUsoAudio`** → stream do **disco** (ou buffer se `.rib`).

Qualquer faixa com chave **`b2:…`** no gateway **só** funciona se o cloud2 deployado souber resolver B2 **e** o arquivo existir no bucket. Por isso a migração do 128 para B2 é **opt-in** (`CRIACAO_USO_B2=1`) e exige **republicação** para o player passar a usar chaves novas.

---

## Portal — contrato que não pode mudar sem fase explícita

- Preview **não** passa pelo Netlify; áudio direto no cloud2.
- Enquanto **`CRIACAO_USO_DISK_MIRROR=1`** (default), mesmo faixas com Neon `b2:…` mantêm cópia em **`uso/`** e o preview legado continua.
- Trocar preview para URL B2/Cloudflare = **fase separada** (só `streamUrl` + env CDN), não incluída no baseline.

---

## Variáveis de ambiente — estado “seguro produção” (baseline)

| Onde | Variáveis | Efeito baseline |
|------|-----------|-----------------|
| cloud2 api + worker | `B2_*` | Masters no B2; falha se ausente (prod) |
| cloud2 | **`CRIACAO_USO_B2=0`** (default código) | 128 **só disco** + chave **`uso:`** — igual ao histórico |
| cloud2 | **`CRIACAO_USO_DISK_MIRROR=1`** | Sempre espelha `uso/` (preview + player após publicar) |
| Netlify | `CRIACAO_INGEST_SECRET`, ingest URL | Preview + ops |
| Player build | `VITE_*` webservice | Sem URL B2 direta |

---

## O que a migração B2 (128) muda — só com opt-in

Com **`CRIACAO_USO_B2=1`** (homolog → prod quando OK):

- Pipeline grava **também** `B2_USO_PREFIX` e Neon pode ficar **`b2:uso/musicas/…`**.
- **`get_musica`** lê B2 se `storage_key` for `b2:` (código dual-read).
- **Player** só vê isso depois de **publicar** programação de novo.

Até lá, deploy do código novo + **`CRIACAO_USO_B2=0`** = comportamento baseline.

---

## Checklist “ainda estamos no baseline?”

- [ ] Nova faixa: `musica_versao.storage_key` começa com **`uso:`** (não `b2:`).
- [ ] Arquivo existe em cloud2 `uso/musicas/{id}/`.
- [ ] Portal toca preview (rede → host cloud2 `/criacao/audio`).
- [ ] PDV produção: `get_musica` 200, cache local ok.
- [ ] `master_storage_key` no B2 (audit master ok).
- [ ] **`CRIACAO_USO_B2`** não está `1` em prod **até** homologação da faixa teste.

---

## Histórico conhecido

- **Jun–jul/2026:** `B2_*` ausente no Envyron → masters `local:` (~549 faixas); reativar B2 não reenvia automaticamente (backfill separado).
- **Jul/2026:** B2 reativado (`us-east-005`, key `…0002`); novos masters voltam ao bucket.

Este documento deve ser atualizado quando o baseline oficial mudar (ex.: 128 só B2 + Player v2), sempre com data e link para fallback.
