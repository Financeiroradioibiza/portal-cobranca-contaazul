# Vinhetas clientes + pasta de vinhetas + abertura/encerramento

**Registro de estado e rollback** — feature pedida em out/2026.  
**Estratégia acordada:** implementar e homologar no **portal primeiro**; **cloud2/publicação** depois; **repo do Player 5** por último (produção intocável até OK explícito).

Documentos relacionados:

- Produção segura: `.cursor/rules/producao-segura-player.mdc`
- Contrato vinhetas VP/VA no disco: `.cursor/rules/infra-contratos-producao.mdc` (§ Vinhetas)
- Baseline armazenamento/publicação: `docs/BASELINE-PORTAL-PLAYER-ARMAZENAMENTO.md`

---

## O que a feature faz (escopo)

| Item | Portal (Neon) | cloud2 | Player 5 |
|------|---------------|--------|----------|
| Pasta **Vinhetas clientes** na biblioteca | Sim | — | — |
| Upload destino **vinheta_cliente** (fila musical, **sem ponto de mix**) | Sim | `skip_ponto_mix` no pipeline | — |
| Import biblioteca → vinheta na programação | Sim | POST `vinheta-from-musica` (copia uso → `vinheta/`) | Entrega vinheta existente (`get_musica` / contrato atual) |
| **Vinhetas únicas** (rename UI; VP/VA cronograma igual) | Sim | Publicação VP/VA **inalterada** para regras antigas | Sem mudança de binário |
| **Pasta de vinhetas** (rotação 1→2→3) + cronograma `vinheta_pasta` | Sim | `publishCronogramas.ts` (novo bloco) | Só após **republicar** prog |
| **Abertura / encerramento** (horário fixo diário) | Sim | `publishCronogramas.ts` (novo bloco) | Só após **republicar** prog |

**O player em produção hoje não lê tabelas novas do Neon.** Ele só muda se alguém **publicar** programação com cloud2 que já inclui a lógica nova — aí o gateway Postgres ganha playlists/agendas extras.

---

## Estado no repositório (atualizar após commit/deploy)

| Marco | Status (preencher na prática) |
|-------|------------------------------|
| Código no Git (`main` ou branch) | **`main`** merge PR #2 → `e554419` (feature `79a231d`); tag **`pre-vinhetas-clientes-2026-10-07`** → `441dad1` |
| Migration Neon `20261007180000_vinheta_cliente_prog` | **Aplicada** (schema up to date, out/2026) |
| Deploy portal (Netlify) | Aguardar build automático pós-merge **ou** disparar deploy manual no painel Netlify |
| Deploy cloud2 (`.cloud2-stage`) | **Não** — não subir `publishCronogramas` / pipeline / `vinheta-from-musica` antes de homologação |
| Deploy Player 5 | **Não** — nenhuma alteração prevista nesta fase |

### Migration (`prisma/migrations/20261007180000_vinheta_cliente_prog/`)

Cria/adiciona:

- `biblioteca_vinheta_cliente`
- `processamento_job.destino_vinheta_cliente`, `skip_ponto_mix`
- `vinheta_pasta`, `vinheta_pasta_item`
- `programacao_vinheta_horario_fixo` + enum `VinhetaHorarioFixoTipo`
- Enum Postgres `AgendamentoAlvo` + valor `vinheta_pasta` (`ADD VALUE IF NOT EXISTS`)

**Compatibilidade:** colunas novas têm default; portal antigo ignora tabelas novas. Não apaga dados de programação existentes.

---

## O que muda o player (gatilhos)

1. **Republicar** uma programação que tenha:
   - agendamento com `alvo_tipo = vinheta_pasta`, ou
   - abertura/encerramento **ativos** com vinheta com áudio, ou
   - (fluxo antigo) VP/VA/vinhetas únicas — **comportamento já conhecido em prod**.

2. **Deploy cloud2** com `.cloud2-stage/publishCronogramas.ts` novo **sem** rollback de imagem — a próxima publicação de qualquer prog passa a interpretar os novos registros.

3. **Não** muda o player: só portal + migration + uploads na fila (128 mono + master B2) + dados só no Neon sem publicar.

---

## Inventário de arquivos (feature)

### Portal — schema e migration

- `prisma/schema.prisma`
- `prisma/migrations/20261007180000_vinheta_cliente_prog/migration.sql`

### Portal — backend

- `lib/criacao/vinhetaClienteBibliotecaService.ts`
- `lib/criacao/vinhetaClienteUploadService.ts`
- `lib/criacao/vinhetaFromMusicaClienteService.ts`
- `lib/criacao/vinhetaPastaService.ts`
- `lib/criacao/programacaoVinhetaHorarioFixoService.ts`
- `lib/criacao/filaService.ts`, `processamentoJobSchemaCompat.ts`
- `lib/criacao/agendamentoService.ts`
- `lib/criacao/biblioteca*.ts` (sidebar, folder types, search, service)
- `lib/criacao/ingestTicket.ts` (`VINHETA_FROM_MUSICA_URL`)
- `app/api/criacao/upload/route.ts`
- `app/api/criacao/biblioteca/route.ts`, `.../vinhetas-clientes/route.ts`
- `app/api/criacao/programacoes/[id]/vinhetas/from-vinheta-cliente/route.ts`
- `app/api/criacao/programacoes/[id]/vinheta-pastas/route.ts`
- `app/api/criacao/programacoes/[id]/vinheta-horario-fixo/route.ts`

### Portal — UI

- `components/criacao/VinhetasProgramacaoExtras.tsx`
- `components/criacao/ProgramacoesPanel.tsx`
- `components/criacao/UploadPanel.tsx`
- `components/criacao/BibliotecaSidebar.tsx`
- `components/criacao/BibliotecaMusicalPanel.tsx`
- `components/criacao/CronogramaAlvoBadges.tsx`

### cloud2 (staging no repo — **risco publicação/fila**)

- `.cloud2-stage/publishCronogramas.ts` — pasta vinhetas + horário fixo
- `.cloud2-stage/criacao/pipeline.ts` — respeita `skip_ponto_mix`
- `.cloud2-stage/vinheta.ts` — endpoint import uso → `vinheta/`
- (verificar diff) `.cloud2-stage/webservice/stubs.js`, `deploy/Dockerfile.api`

### Player 5

- **Nenhum arquivo** neste escopo (baseline congelado).

---

## Antes de ir para produção (checkpoint Git)

Para conseguir **regredir código** com precisão:

1. Commitar a feature em branch dedicada (ex.: `feat/vinhetas-clientes-prog`).
2. Tag no commit **anterior** ao merge/deploy:
   ```bash
   git tag -a pre-vinhetas-clientes-2026-10-07 -m "Antes vinhetas clientes + pasta vinhetas + horário fixo"
   git push origin pre-vinhetas-clientes-2026-10-07
   ```
3. Anotar abaixo o SHA deployado em cada camada:

| Camada | SHA / imagem / deploy ID | Data |
|--------|---------------------------|------|
| Portal Netlify | | |
| cloud2 API/worker | | |
| Neon migration | `20261007180000_vinheta_cliente_prog` | |

---

## Rollback por cenário

### A) Problema no **portal** (UI/API), player ainda normal

**Sintoma:** erro ao salvar pasta de vinhetas, upload vinheta_cliente, etc.; PDVs tocando como antes.

1. **Netlify:** rollback para deploy anterior (ou redeploy do tag `pre-vinhetas-clientes-*`).
2. **Neon:** **opcional** manter migration — schema aditivo não quebra portal antigo.
3. **Não** é necessário mexer no player nem no cloud2 se cloud2 novo **não** foi deployado.

### B) Problema **forte no player** após **publicar** programação com feature nova

**Sintoma:** VP estranho, abertura/encerramento indevidos, pasta vinhetas no ar, etc.

Ordem recomendada (do efeito imediato ao estrutural):

1. **Parar de republicar** programações de teste em clientes reais.
2. **cloud2 — rollback de código (prioridade):** redeploy da imagem/commit **anterior** a `publishCronogramas.ts` com `vinheta_pasta` e horário fixo. Com cloud2 antigo, nova republicação **ignora** `vinheta_pasta` e tabelas de horário fixo (dados ficam no Neon, sem efeito no gateway).
3. **Republicar programações afetadas** com cloud2 **antigo** (ou fluxo de publicação já usado hoje) para reescrever playlists/agendas no gateway — tratar como **incidente de programação**, igual regressões passadas de cronograma.
4. **Portal:** pode permanecer na versão nova; desativar no portal (pausar regras `vinheta_pasta`, desativar abertura/encerramento) antes de republicar reduz surpresas.
5. **Player 5:** rollback de binário **só se** houver deploy de player (não previsto nesta feature). Produção atual continua no repo baseline.

**Não** apagar tabelas Neon às pressas — o enum `AgendamentoAlvo` com valor `vinheta_pasta` **não** se remove facilmente no Postgres; basta não publicar com cloud2 novo.

### C) Problema na **fila** (mix / vinheta_cliente)

**Sintoma:** faixas vinheta_cliente com mix indevido ou falha no armazenamento.

1. **cloud2:** rollback só do `pipeline.ts` se `skip_ponto_mix` estiver errado; ou corrigir forward.
2. Jobs já processados: dados em `biblioteca_vinheta_cliente` e `uso/` — rollback de áudio segue política normal (B2 master + disco uso); não há migração em massa automática nesta doc.
3. Portal antigo ainda enfileira se API nova estiver no ar — rollback Netlify impede novos jobs `destino_vinheta_cliente`.

### D) Reverter **tudo** (feature cancelada)

1. Rollback portal + cloud2 para tag pré-feature.
2. Migration Neon: **manter** tabelas vazias (recomendado) **ou** dropar manualmente em janela de manutenção (script abaixo — **só** se não houver dados a preservar).
3. Remover branch ou reverter merge no Git.

---

## Script SQL opcional (drop feature — destrutivo)

Usar **apenas** se decidirem abandonar a feature e **não** houver linhas a manter. Fazer backup Neon antes.

```sql
-- Ordem: dependentes primeiro
DROP TABLE IF EXISTS "programacao_vinheta_horario_fixo";
DROP TABLE IF EXISTS "vinheta_pasta_item";
DROP TABLE IF EXISTS "vinheta_pasta";
DROP TABLE IF EXISTS "biblioteca_vinheta_cliente";

ALTER TABLE "processamento_job" DROP COLUMN IF EXISTS "destino_vinheta_cliente";
ALTER TABLE "processamento_job" DROP COLUMN IF EXISTS "skip_ponto_mix";

DROP TYPE IF EXISTS "VinhetaHorarioFixoTipo";
-- AgendamentoAlvo + 'vinheta_pasta': valor enum permanece no Postgres (harmless se cloud2 antigo).
```

---

## Ordem de deploy segura (referência)

1. Tag `pre-vinhetas-clientes-*` no Git.
2. `prisma migrate deploy` (Neon).
3. Deploy **portal** — homologar upload, biblioteca, UI de programação **sem** publicar prog de produção.
4. Deploy **cloud2** (pipeline + vinheta-from-musica) — homologar 1 faixa vinheta_cliente + 1 import.
5. Deploy **cloud2** `publishCronogramas` — homologar **uma programação de teste** + Player 5 homologação.
6. Produção: volume só após OK explícito do Rafael.

---

## Player homolog `test7out` (não produção)

Repo **`radio-ibiza-player-5`**: ver **`docs/HOMOLOG-TEST7OUT.md`**.

- Mac: `npm run homolog:test7out` ou `homolog:test7out:web` (Chrome local, versão **test7out**).
- Windows: instalador **`Radio Ibiza HML test7out`** — pasta `%ProgramData%\RadioIbizaPlayer-HML-test7out`.
- **Não** roda `deploy:player5:prod`.

---

## Homologação mínima (checklist)

- [ ] Upload MP3 → destino Vinhetas clientes → fila **sem** ponto de mix → pasta biblioteca.
- [ ] Import na programação (vinheta única) com cloud2 `vinheta-from-musica`.
- [ ] Pasta de vinhetas + cronograma `vinheta_pasta` (portal).
- [ ] Abertura/encerramento salvos (portal).
- [ ] Publicar prog **teste** → validar gateway + 1 PDV homologação.
- [ ] Confirmar que prog **sem** novos campos publica igual baseline.

---

## Histórico deste documento

| Data | Nota |
|------|------|
| 2026-10-07 | Criação: estado local pré-commit; estratégia portal → cloud2 → player; procedimentos de rollback. |
| 2026-10-07 | Tag `pre-vinhetas-clientes-2026-10-07` em `441dad1` (main antes da feature). |

**Responsável por atualizar a tabela “Estado no repositório”:** quem fizer commit, migration ou deploy (SHA + data).
