# Pipeline acordado — passos B2 (128 + verify)

Escopo: **caminhos de armazenamento**, leitura dual, verificação B2. Player 5 novo fica fora deste pacote.

## Contrato de chaves

| Artefato | Bucket | Prefixo env | Neon |
|----------|--------|-------------|------|
| Master 192 | B2 | `B2_MASTER_PREFIX` (ex. `master/`) | `musica_biblioteca.master_storage_key` |
| 128 mono / .rib | B2 | `B2_USO_PREFIX` (ex. `uso/`) | `musica_versao.storage_key` = `b2:uso/musicas/{id}/mp3_128_mono…` |
| Espelho preview legado | NVMe cloud2 | `uso/musicas/…` | opcional com `CRIACAO_USO_DISK_MIRROR=1` (default) |

Trim **não** altera master. Reprocess só regera 128 (+ espelho disco se ativo).

## Flags cloud2

| Variável | Default | Efeito |
|----------|---------|--------|
| `CRIACAO_USO_B2` | **`0`** | **`1` só após homolog** — envia 128 para B2; **`0` preserva produção atual** |
| `CRIACAO_USO_DISK_MIRROR` | `1` | **Manter ligado** — espelho NVMe (portal + fallback player) |

Baseline e fallback: **`docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`**, **`docs/FALLBACK-ARMAZENAMENTO-B2.md`**.

## Certeza de que chegou no B2

1. **No pipeline:** após cada `PutObject`, `HeadObject` com tamanho igual — falha → item **não** fica `pronta`.
2. **Por faixa:** `GET /criacao/ops/b2-verify/:musicaId` (secret ingest).
3. **Lote:** `GET /criacao/ops/b2-audit?limit=500` — compara Neon vs B2.
4. **CLI:** `npm run criacao:audit-b2` ou `--musica=id`.
5. **Painel:** Config → Servidores — cards B2 master + B2 128; compare contagem Neon vs listagem S3.

## Ordem de deploy / teste

1. Deploy cloud2 (api + worker-audio) com `B2_*` + `B2_USO_PREFIX=uso/` — **`CRIACAO_USO_B2` permanece `0` em prod** até faixa teste.
2. Homolog: `CRIACAO_USO_B2=1` → faixa teste → Neon `b2:…` + objetos em `master/` e `uso/`.
3. `npm run criacao:audit-b2 -- --musica=ID` → `ok: true`.
4. Trim na faixa → audit de novo; master inalterado no B2.
5. **Depois:** portal preview CDN (128 B2); **depois:** Player 5 v2 URL/CORS.

Rollback: `CRIACAO_USO_B2=0` (volta chave `uso:` disco); faixas já `b2:` continuam legíveis se B2 ativo.
