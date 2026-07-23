# Fallback — armazenamento (Portal + Player)

Use este guia se deploy da migração B2 (128) causar preview mudo, `get_musica` 404, ou fila presa em erro.

Baseline completo: **`docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`**

---

## Nível 0 — Parar de escrever 128 no B2 (volta ao baseline imediato)

No Envyron **`/opt/portal-ibiza/infra/.env`** (api **e** worker-audio):

```bash
CRIACAO_USO_B2=0
CRIACAO_USO_DISK_MIRROR=1
```

```bash
cd /opt/portal-ibiza/infra
docker compose up -d api worker-audio
```

**Efeito:** novas faixas e reprocess de trim voltam a gravar **`uso:`** + disco `uso/` — igual ao histórico.  
**Não desfaz** faixas que já têm Neon `b2:` (continuam no bucket; player só usa se gateway tiver essa chave).

Tempo típico: **&lt; 2 min**. Risco player atual: **nenhum** para faixas ainda `uso:` / publicadas com disco.

---

## Nível 1 — Faixa publicada com `b2:` e player não toca

Causa comum: programação publicada com `storage_key` `b2:…` mas B2 indisponível ou objeto ausente.

**Opção A — Republicar com versão disco (preferir se cópia local existe):**

1. Garantir `CRIACAO_USO_B2=0`.
2. No Neon, conferir se ainda há espelho em cloud2 `uso/musicas/{id}/` (mirror estava ativo).
3. Se `musica_versao.storage_key` for `b2:` mas disco ok: ajustar chave para **`uso:musicas/…`** (suporte/ops) **ou** reprocessar trim uma vez com B2 off (regenera `uso:`).
4. **Publicar / disparar atualização** no portal para recopiar `storage_key` ao gateway.

**Opção B — Manter `b2:` e consertar B2:**

1. Verificar `B2_*` no worker **e** api.
2. `npm run criacao:audit-b2 -- --musica=ID`
3. Corrigir credencial/região; reprocessar faixa se objeto faltando.

Player **não** lê Neon direto — só o que está em **`musicas.storage_key`** no gateway após publicação.

---

## Nível 2 — Preview portal mudo (biblioteca / edição)

1. Confirmar **`CRIACAO_USO_DISK_MIRROR=1`** e arquivo em `uso/musicas/{id}/`.
2. Testar URL assinada `/criacao/audio/…` (401/403 → secret; 404 → disco).
3. **Não** é necessário B2 para preview baseline — preview **não** usa B2 hoje.

Se no futuro preview apontar para CDN B2: reverter env no **Netlify** (`CRIACAO_AUDIO_CDN_*`) para vazio e redeploy portal — cloud2 `/criacao/audio` volta.

---

## Nível 3 — Fila em erro `b2_verify_*` ou `b2_nao_configurado`

| Erro | Ação |
|------|------|
| `b2_nao_configurado` | Restaurar `B2_*` no `.env` (ver `docs/CLOUD2-ENV-OBRIGATORIO.md`, `scripts/apply-cloud2-b2-env.sh`) |
| `b2_verify_tamanho` | Falha real de upload; retry item; checar bucket/quota/key |
| Master local indevido | **Não** usar `CRIACAO_ALLOW_LOCAL_MASTER=1` em prod |

128 B2 off (`CRIACAO_USO_B2=0`) **não** desliga verify do **master** — masters continuam obrigatórios no B2 em produção.

---

## Nível 4 — Rollback de código (último recurso)

1. Reverter deploy cloud2 para commit anterior conhecido bom (sync portal-ibiza / imagem).
2. Manter `.env`: `CRIACAO_USO_B2=0`, `B2_*` ok para masters.
3. Portal: reverter só se painel Servidores/audit quebrou ops — player não depende do Netlify para áudio.

---

## O que **não** fazer

- Mudar URL de playlist / `get_musica` no Player **5 atual** sem versão nova homologada.
- Apagar prefixo `uso/` no NVMe “para economizar” enquanto player depende de disco.
- Ligar **`CRIACAO_USO_B2=1`** em prod antes de 1 faixa teste + audit + OK Rafael.
- Substituir silenciosamente masters `local:` por B2 sem backfill planeado.

---

## Contatos de verificação pós-fallback

```bash
# Baseline: chaves uso: no Neon para faixas novas
# Audit master (sempre)
npm run criacao:audit-b2 -- --limit=50

# Uma faixa
npm run criacao:audit-b2 -- --musica=CLxxx
```

Config → **Servidores**: B2 masters ativo; contagem Neon vs bucket; card 128 B2 só relevante com opt-in ligado.

---

## Ativar migração de novo (depois do fallback)

1. Homolog: `CRIACAO_USO_B2=1` + faixa teste + audit ok.  
2. Confirmar mirror disco ainda `1` até Player v2 + preview CDN.  
3. Prod: mesmo env; monitorar fila e uma loja piloto **depois** de republicar programação piloto.

Ver **`docs/PLANO-B2-128-PASSOS.md`**.
