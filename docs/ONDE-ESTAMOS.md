# Onde estamos — Radio Ibiza (portal + produção)

Documento de **handoff entre conversas**. Leia isto no início de um chat novo para continuar de onde paramos.

**Última atualização:** 30/06/2026  
**Branch:** `main` (limpa, em sync com `origin/main`)  
**Último commit:** `11e06c4` — `fix(criacao): biblioteca slim, mix ATL CRICA, vinhetas lab e config admin`

---

## Como retomar em um chat novo

Cole algo neste formato:

> Estamos no repo `portal-cobranca-contaazul`. Leia `docs/ONDE-ESTAMOS.md` e continue de onde paramos.  
> [descreva a tarefa do dia]

**Arquivos que o agente deve ler primeiro:**

| Prioridade | Arquivo | Por quê |
|------------|---------|---------|
| 1 | Este arquivo | Estado geral e pendências |
| 2 | `docs/CRIACAO-PROCESSAMENTO-MUSICAL.md` | Pipeline upload → biblioteca (cloud2) |
| 3 | `docs/CRIACAO-ATUALIZACAO-PROGRAMACAO.md` | Publicação / atualização de programações |
| 4 | `AGENTS.md` | Next.js deste repo tem APIs diferentes do training data |

**Transcript da conversa que gerou este estado:**  
`.cursor/projects/.../agent-transcripts/ce8978ef-4b2f-4219-90be-4c1aa8ab60be.jsonl`

---

## URLs e ambientes

| Ambiente | URL | Deploy |
|----------|-----|--------|
| **Portal Criação / Produção musical** | https://portal.radioibiza.app.br | Netlify, branch `main` |
| **Portal cobrança (legado URL)** | https://site-vencidos-ibiza.netlify.app | Mesmo repo Netlify |
| **Processamento de áudio (cloud2)** | https://cloud2.radioibiza.app.br | VM Envyron — repo `portal-ibiza`, pasta `.cloud2-stage/` |
| **Repositório** | `Financeiroradioibiza/portal-cobranca-contaazul` | GitHub |

**Banco:** Neon Postgres (`DATABASE_URL` no `.env` local e no Netlify).  
**Migrations pendentes de conferir no Neon:** ver seção [Migrations](#migrations-neon).

---

## Visão geral do que estamos construindo

Portal único (Next.js + Neon) com várias áreas:

| Área | Rotas | Status |
|------|-------|--------|
| Cobrança / Conta Azul | `/cobranca/*` | Em produção |
| Cadastros Rio × produção | `/cadastros/*` | Em produção |
| Produção PDV / chamados | `/producao/*` | Em produção — dashboard com chamados no topo |
| **Criação musical** | `/criacao/*` | **Foco atual** — upload, biblioteca, programações, ATL CRICA, vinhetas IA, fila |
| Player 5 / gateway | Integração parcial | Ver `docs/PLAYER5-INTEGRACAO.md` |

**Regra de ouro (cobrança):** Planilha Rio manda quem paga. **Criação** organiza o que toca (programação → pastas → faixas).

---

## Módulo Criação — estado funcional (30/06/2026)

### Submenus principais (`/criacao`)

| Submenu | O que faz |
|---------|-----------|
| **PRODUÇÃO** (ex-Atualizações) | Central de programações, painéis de atualização, chamados |
| **Programações** | Editor de pastas/playlists, dono obrigatório, destaque faixas novas |
| **Biblioteca musical** | Acervo processado; view completa e **lista slim** (play + tags coloridas) |
| **Upload** | Enfileira MP3 por pasta ou biblioteca |
| **Fila** | Revisão de duplicatas chromaprint, status do worker |
| **ATL CRICA** | Fluxo mensal por competência: upload por cliente/pasta, export/import hierarquia ZIP |
| **Vinhetas IA** | ElevenLabs + trilha ambiente; lab de rascunho/preview/aprovação |

### ATL CRICA — como funciona hoje

1. Abrir programação(ões) na competência (`/api/criacao/atl-crica/abrir`).
2. Usuário monta lotes por pasta (arquivos locais e/ou faixas já na biblioteca).
3. `submitAtlCricaFileUpload` → `POST /api/criacao/upload` → browser envia MP3 **direto ao cloud2** (ticket HMAC).
4. Worker (`/.cloud2-stage/criacao/pipeline.ts`) processa: dedupe → mix/trim → 128 mono + LUFS → tags → `musica_biblioteca`.
5. Job `upload_pasta` concluído → `applyPastaUploadsForJob` coloca faixa na **pasta da programação**.
6. Portal aplica tag criativa = **nome da pasta** (`buildAtlCricaPastaUploadTag`) via `uploadTagService`.
7. `marcar-subido` fecha o ciclo ATL CRICA na UI.

**Export/import hierarquia:** ZIP com `atl-manifest.json` — ver `AtlCricaImportExportSection`, `atlCricaHierarquiaService`, `atlCricaImportService`.

**Cliente de teste usado nas conversas:** `Teste portal` → `Prog Teste 002` → pasta `jazz` (7 MP3 jazz enviados em 30/06/2026).

### Vinhetas IA — como funciona hoje

- Rascunho → gerar (ElevenLabs + mix trilha no cloud2) → preview editável → aprovar → puxar em programações.
- Parâmetros ajustáveis: volume trilha (~18%), velocidade voz, estabilidade ElevenLabs; botões “trilha −10%”, “ralentar”, etc.
- **Menu ⚙ Config** (colapsável): Conta ElevenLabs, vozes fixas admin, upload trilhas ambiente — **somente Rafael Gasparian** (`rafael@radioibiza.com.br` ou nome contendo “Rafael Gasparian”). Ver `lib/criacao/vinhetaConfigAccess.ts`.
- Demais usuários: escolhem voz/trilha nos dropdowns de “Nova vinheta”; não veem Config.

### Dono da programação

- Obrigatório ao criar programação (UI + API).
- PATCH não remove dono.
- Persistência ao atribuir dono na Central (`atlCricaDonoPersist`).

### Destaque faixas novas (verde)

- `pasta_musica.added_at` vs `programacao.atualizacao_aberta_em` — ver `lib/criacao/pastaMusicaUi.ts`, poll em `ProgramacoesPanel.tsx`.
- Caixa **ATL CRICA — atualizações abertas** (violeta) no topo da Central; laranja só aberturas manuais.

---

## Commits recentes relevantes (jun/2026)

| Commit | Resumo |
|--------|--------|
| `11e06c4` | Biblioteca slim play+tags; fix vinhetas lab (schema compat); menu Config vinhetas; worker mix duplicata+fallback |
| `919f867` | Vinhetas reeditáveis; dashboard produção com chamados no topo |
| `499e5cc` | Dono obrigatório; ATL CRICA UI; fila auto concluída; faixas novas via `addedAt` |
| `9cc7957` | Preview áudio vinhetas IA |
| `1f811d7` | Import ATL CRICA via manifest; tag por pasta/dono |
| `8ffa1c2` | Export/import hierarquia ATL CRICA (ZIP) |
| `3762a0f` | Catálogo fixo vozes/trilhas vinhetas |
| `4dfe97e` | Submenu Vinhetas IA + mix cloud2 |

---

## Pendências manuais (importante)

### 1. Redeploy do worker cloud2

Mudanças em **`.cloud2-stage/criacao/pipeline.ts`** só valem após redeploy no **portal-ibiza** (Envyron), separado do Netlify.

**O que o commit `11e06c4` adicionou no worker (ainda precisa ir pro ar):**

- Duplicata `content_hash`: se faixa existente não tem `mp3_128_mono`, roda produção completa; se tem mix 0, reanalisa upload e atualiza mix/trim.
- Fallback: detecção de fade = 0 → usa `CRIACAO_DEFAULT_MIX_SEG` (default **1 s**).

**Diagnóstico:** `scripts/diagnose-criacao-cloud2.sh`

### 2. Migrations Neon

Rodar localmente (com `DATABASE_URL` no `.env`):

```bash
npx prisma migrate deploy
```

Migration **crítica para vinhetas** (colunas `ia_bed_volume`, `ia_voice_speed`, `ia_voice_stability`):

- `prisma/migrations/20260703160000_vinheta_ia_lab_params/migration.sql`

**Workaround já no código:** `lib/criacao/vinhetaSchemaCompat.ts` — lab vinhetas funciona **com ou sem** essa migration. Mesmo assim, aplicar no Neon é recomendado.

Outras migrations recentes de criação:

- `20260703140000_pasta_musica_added_at` — destaque faixas novas
- `20260703120000_vinheta_trilha` — trilhas ambiente vinhetas
- `20260702120000_vinheta_ia_lab` — tabela/lab vinhetas IA

### 3. Faixas já processadas com mix 0

Uploads de 30/06 (ex.: pasta jazz Teste portal) entraram na biblioteca com **mix 0** porque o worker em produção ainda não tinha o fallback/redeploy. Reprocessar: re-upload ou job manual após redeploy cloud2.

---

## Investigações e armadilhas conhecidas

### “ATL CRICA não entrou na biblioteca”

**Conferido no Neon em 30/06/2026:** as 7 faixas do job `ATL CRICA · jazz` (cliente `Teste portal`) **estão na biblioteca** (`status: pronta`), com tag `jazz`, versão `mp3_128_mono`, LUFS −14, e na pasta `jazz` de `Prog Teste 002`.

| Arquivo | Biblioteca | Observação |
|---------|------------|------------|
| Emilie-Claire Barlow — *These Boots…* | ✅ | Duplicata hash → reutilizou faixa de 26/06 |
| Emmaline — *Old Soul Love* | ✅ | Duplicata hash |
| Flora — *Amapola* | ✅ | Duplicata hash |
| Erin Boheme — *Let's Do It* | ✅ | Nova 30/06 |
| Flora — *La Puñalada…* | ✅ | Nova 30/06 |
| Flora — *Cielito Lindo…* | ✅ | Nova 30/06 |
| Flora Martinez — *You Belong…* | ✅ | Nova 30/06 |

**Por que parece que “sumiu” na UI:**

1. **Filtro “Não usadas”** na biblioteca — ATL CRICA coloca a faixa **direto na programação**; filtro `listFilter=unused` esconde tudo que já está em alguma pasta.
2. **Ordem alfabética** — biblioteca ordena por artista, não por data de upload.
3. **Timing** — upload ~14:17, processamento até ~14:23, tags ~14:39, pasta ~14:50 (30/06).
4. **Duplicatas** — 3 arquivos não criaram linha nova; reutilizaram faixa existente (mesmo ID, nova tag `jazz`).

**Como achar:** Biblioteca → Status “Todos” → desligar “Não usadas” → filtrar tag **`jazz`** ou buscar `Flora` / `Erin`.

### Mix 0 / sem trim

- INSERT inicial grava `mix_segundos_finais = 0`; só atualiza em `stepProduce` se worker rodar.
- Detecção de fade (`mixTrimDetect.ts`) retorna 0 em faixas sem fade de rádio típico (normal em jazz).
- Duplicata hash **pulava** `stepProduce` antes do fix `11e06c4` (no código local; redeploy pendente).

### Erro 500 em `/api/criacao/vinhetas/lab`

- Causa: migration `20260703160000` não aplicada → Prisma lia colunas `ia_*` inexistentes.
- Fix: `vinhetaSchemaCompat.ts` + selects condicionais em `vinhetaLabService.ts` (commit `11e06c4`).

---

## Mapa de arquivos — Criação (referência rápida)

### UI

| Arquivo | Papel |
|---------|--------|
| `components/criacao/AtlCricaPanel.tsx` | Board ATL CRICA + upload por pasta |
| `components/criacao/AtlCricaImportExportSection.tsx` | ZIP export/import hierarquia |
| `components/criacao/BibliotecaMusicalPanel.tsx` | Biblioteca (full + slim com play/tags) |
| `components/criacao/ProgramacoesPanel.tsx` | Editor programações + destaque verde |
| `components/criacao/ProgramacoesAdminPanel.tsx` | Central PRODUÇÃO |
| `components/criacao/VinhetasPanel.tsx` | Vinhetas IA + menu Config |
| `components/criacao/FilaPanel.tsx` | Fila de processamento |

### Portal (API + serviços)

| Arquivo | Papel |
|---------|--------|
| `lib/criacao/filaService.ts` | Cria jobs `upload_pasta` |
| `lib/criacao/pastaUploadService.ts` | `applyPendingPastaUploads` (fallback portal) |
| `lib/criacao/uploadTagService.ts` | Tags pós-processamento |
| `lib/criacao/bibliotecaService.ts` | Listagem biblioteca |
| `lib/criacao/atlCricaUploadClient.ts` | Client upload ATL CRICA |
| `lib/criacao/atlCricaUploadTag.ts` | Tag = nome da pasta |
| `lib/criacao/vinhetaLabService.ts` | CRUD lab vinhetas |
| `lib/criacao/vinhetaConfigAccess.ts` | ACL Config vinhetas (Rafael) |
| `lib/criacao/vinhetaSchemaCompat.ts` | Compat colunas `ia_*` |
| `app/api/criacao/upload/route.ts` | Enfileira upload + tickets |

### Worker cloud2 (redeploy separado)

| Arquivo | Papel |
|---------|--------|
| `.cloud2-stage/criacao/pipeline.ts` | Pipeline principal |
| `.cloud2-stage/criacao/mixTrimDetect.ts` | Ponto de mix + trim fim |
| `.cloud2-stage/criacao/dedupe.ts` | content_hash + chromaprint |
| `.cloud2-stage/criacao/config.ts` | `CRIACAO_DEFAULT_MIX_SEG`, LUFS, etc. |

---

## Melhorias sugeridas (não implementadas)

Pedidas ou discutidas, **ainda não feitas**:

1. **UX biblioteca pós-ATL CRICA:** aviso quando filtro “Não usadas” esconde uploads; link “Ver tag jazz”; ordenação **Recentes**.
2. **Reprocessar em lote** faixas com mix 0 antigas.
3. **Expor LUFS/formato** na biblioteca para conferência visual.
4. **Conferir** se migration `20260703160000` foi aplicada no Neon de produção.

---

## Deploy e operação

### Portal (Netlify)

```bash
git push origin main   # deploy automático
```

Variáveis críticas: `DATABASE_URL`, `CRIACAO_INGEST_SECRET`, `CRIACAO_INGEST_URL`, `ELEVENLABS_API_KEY` (vinhetas).

### Worker (cloud2)

- Código espelhado em `.cloud2-stage/` deste repo.
- Deploy no servidor Envyron / projeto `portal-ibiza` — **não** via Netlify.
- Env: `PORTAL_DATABASE_URL`, `CRIACAO_STORAGE_ROOT`, `CRIACAO_RIB_SECRET`, `CRIACAO_DEFAULT_MIX_SEG`, `GEMINI_API_KEY`, etc.

### Banco

```bash
npx prisma migrate deploy
npx prisma studio   # inspeção local
```

---

## Legado e outros trilhos (contexto)

| Sistema | Onde | Papel |
|---------|------|--------|
| Painel Cake | `painel.radioibiza.com.br` | CRUD legado ~4000 players |
| Webservice Cake | `cloud.radioibiza.com.br` | Players antigos |
| **portal-ibiza** (Envyron) | cloud2 + gateway novo | Processamento áudio + Player 5 |
| Player 4 produção | Netlify | Aponta Cake — **não alterar** sem plano |

Projetos locais no Mac:

| Pasta | Conteúdo |
|-------|----------|
| `~/Documents/portal-cobranca-contaazul` | **Este repo** |
| `~/Documents/playeribiza2015-2026/portal-ibiza` | API cloud2 + deploy worker |
| `~/Documents/playeribiza2015-2026/radio-ibiza-player-4` | Player + protocolo |

---

## Usuários e permissões

Ver `docs/PORTAL-USUARIOS-PERMISSOES.md`.

| Pessoa | E-mail | Notas |
|--------|--------|-------|
| Rafael Gasparian | `rafael@radioibiza.com.br` | `master`; único com Config vinhetas IA |
| Demais criativos | cadastro `portal_user` | Tags com iniciais/cor por usuário |

---

## Documentos relacionados

| Arquivo | Conteúdo |
|---------|----------|
| `docs/CRIACAO-PROCESSAMENTO-MUSICAL.md` | Pipeline upload, filas, workers, escala |
| `docs/CRIACAO-ATUALIZACAO-PROGRAMACAO.md` | Publicação programações / painéis |
| `docs/FASE-2-PRODUCAO-MUSICAL.md` | Visão arquitetura produção + webservice |
| `docs/PLAYER5-INTEGRACAO.md` | Sync Player 5, tokens, publicar |
| `docs/PLAYER5-PILOTO.md` | Piloto end-to-end |
| `docs/PORTAL-USUARIOS-PERMISSOES.md` | Papéis e equipe |
| `docs/BACKUP-E-RESTAURACAO.md` | Backup código e banco |
| `README.md` | Variáveis de ambiente |

---

## Histórico de decisões (marcos)

| Data | Decisão |
|------|---------|
| 2026-05 | Portal cobrança Netlify + Neon; Planilha Rio v2 |
| 2026-06-17 | Fase 0 criação musical — biblioteca, fila, upload |
| 2026-06-18 | Player 5 integração (código portal + cloud2) |
| 2026-06-19 | Doc pipeline criação — `CRIACAO-PROCESSAMENTO-MUSICAL.md` |
| 2026-06-28 | ATL CRICA export/import ZIP + hierarquia local |
| 2026-06-30 | Dono obrigatório; vinhetas lab reeditável; Config vinhetas só Rafael; fix mix duplicata (código, redeploy pendente) |
| **Pendente** | Redeploy cloud2 com pipeline `11e06c4`; confirmar migrations Neon vinhetas |

---

*Mantenha este arquivo atualizado após cada marco (deploy, migration, investigação importante).*
