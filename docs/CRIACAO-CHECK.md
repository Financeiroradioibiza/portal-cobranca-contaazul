# CHECK — comparar pasta local com programação do cliente

Documento de referência para **não perder** o que o CHECK faz, como pareia faixas, vereditos, UI e deploy.  
Leia junto com `docs/CRIACAO-PROCESSAMENTO-MUSICAL.md` (fila/dedupe **não** é o mesmo fluxo).

**Última atualização:** 18/08/2026  
**Rota portal:** `/criacao/check`  
**Análise de áudio:** cloud2 (`checkAnalyze.ts`)  
**Commits principais:** `48173b3` (título núcleo) · `9034c03` (veredito ao vivo, ordem, ações pasta)

---

## O que é

Ferramenta **somente leitura** (com exceção das ações de apagar na pasta/biblioteca) para:

1. Escolher **cliente → programação → pasta** (faixas já publicadas).
2. Enviar **MP3s locais** (scratch temporário no cloud2).
3. Para cada upload, **achar o par** na pasta por artista/título.
4. **Comparar** duração, Chromaprint, hash — e classificar o resultado.

Os arquivos de upload ficam em scratch no cloud2 e são apagados ao sair da página.

---

## O que o CHECK **não** altera

| Sistema | Afetado? |
|---------|----------|
| Fila de upload / dedupe da criação | **Não** — continua `metadataMatchesForDedupe` (match literal) |
| Player 5 / cronogramas / publicação | **Não** |
| Processamento LUFS / B2 / disco `uso/` | **Não** |

Funções com sufixo `ForCheck` e `isCheckVersionVariantPair` existem **só** para o CHECK.

---

## Fluxo técnico

```
Portal CheckPanel
  → POST /api/criacao/check/session          (scratch)
  → upload MP3 via ticket cloud2             (ingest scratch)
  → GET  /api/criacao/check/pasta-tracks     (faixas da pasta, Neon)
  → POST cloud2 /criacao/check/analyze       (ticket HMAC)
  → POST /api/criacao/check/enrich           (URLs preview portal)
```

Análise por faixa (`checkAnalyze.ts`):

1. Extrair artista/título (tags ID3 ou nome do arquivo).
2. **`findBestMetadataMatch`** — achar par na pasta (3 passadas, ver abaixo).
3. Se **sem par** → veredito `sem_par_na_pasta` (0%, sem waveform do sistema).
4. Se **com par** → pontuar metadados, duração, Chromaprint, hash → veredito.

---

## Pareamento por nome (desde 18/08/2026)

### Problema que existia

Upload com sufixos `(Single Version)`, `(7" Version)`, `(Live)`, `(Demo)` vs pasta com título **limpo** caía em **sem par na pasta**, embora fosse a mesma música.

### Solução — título núcleo (commit `48173b3`)

Funções em `lib/criacao/dedupeNormalize.ts` e espelho `.cloud2-stage/criacao/dedupe.ts`:

| Função | Papel |
|--------|--------|
| `stripTitleVersionSuffixesRaw` | Remove `~N` legado e sufixos `(…)` no **final** do título (até 5 níveis) |
| `tituloCoreForCheck` | Núcleo normalizado (sem acento, minúsculas, etc.) |
| `tituloMatchesForCheck` | Igualdade do núcleo |
| `artistaMatchesForCheck` | Dedupe normal **ou** subconjunto de tokens (ex.: `The Police/Police` = `The Police`) |
| `metadataMatchesForCheck` | Título núcleo + artista CHECK |

**Ordem de busca do par** (`findBestMetadataMatch`):

1. `metadataMatchesForCheck` (artista + título núcleo)
2. `tituloMatchesForCheck` + `artistaMatchesForCheck`
3. Só `tituloMatchesForCheck` (artista diferente — par fraco)

Chromaprint **não** varre a pasta sozinho; só roda **depois** de achar par por metadado.

---

## Vereditos (desde 18/08/2026 — commit `9034c03`)

Definições em `lib/criacao/checkLabels.ts`. Lógica em `.cloud2-stage/criacao/checkAnalyze.ts` → `verdictFromScore`.

| Veredito | Label UI | Cor (badge) | Quando |
|----------|----------|-------------|--------|
| `mesma_gravacao` | Mesma gravação | Verde esmeralda | Chromaprint idêntico ou score ≥ 85% |
| `provavelmente_mesma` | Provavelmente a mesma | Verde lima | Score ≥ 60% |
| `diferente` | Faixa diferente | Rosa | Par encontrado, score baixo, **sem** indicador de versão assimétrico |
| `possivel_versao_ao_vivo_ou_diferente` | Possível versão ao vivo ou diferente | **Roxo/violeta** | Mesmo núcleo de título, mas **um lado** tem sufixo/marcador de versão que o outro não (`isCheckVersionVariantPair`) |
| `revisar_possivel_versao` | Revisar — possível versão diferente | Âmbar | Par ok, score ≥ 30 ou metadados ok, **sem** categoria “ao vivo/diferente” acima |
| `sem_par_na_pasta` | Sem par na pasta | Cinza | Nenhuma faixa da pasta bate artista/título |

### Indicadores de “versão assimétrica”

Detectados quando o **título normalizado completo** difere, mas o **núcleo** é igual — ex.:

- `(Live)`, `LIVE`, `AO VIVO`
- `ACÚSTIC`, `ACOUSTIC`, `Acoustic`
- `Remix`, `remixed`
- `remaster`, `Remastered`
- `(Reloaded)`, `(Single Version)`, `(7" Version)`, `(Demo)`, etc.

**Exemplo Caetano Veloso:** upload `Beleza Pura` vs pasta `Beleza Pura (Live)` → **Possível versão ao vivo ou diferente** (não “Revisar” genérico).

Se Chromaprint for **idêntico**, prevalece **Mesma gravação** (mesmo áudio, tag/nome diferente).

---

## Duração no “Revisar”

Em veredito `revisar_possivel_versao`, se a diferença de duração for **≤ 10 segundos**:

- Linha **Duração** fica ✓ **verde**
- Texto: `Duração parecida (Δ Xs)`

Implementação: `patchRevisarDurationCheck` em `checkAnalyze.ts` (só nesse veredito).

---

## Ordenação dos resultados na UI

Função `checkVerdictSortOrder` em `checkLabels.ts`. `CheckPanel` ordena por veredito, depois por `matchScore` asc.

| Ordem | Veredito |
|-------|----------|
| 0–1 | Mesma gravação · Provavelmente a mesma (OK no topo) |
| 2 | Faixa diferente |
| 3 | Possível versão ao vivo ou diferente |
| 4 | Revisar — possível versão diferente |
| 5 | Sem par na pasta |

---

## Ações na faixa da pasta (painel expandido)

**Onde:** card **“Na pasta do cliente”** — **não** no upload (scratch).

| Botão | API | Efeito |
|-------|-----|--------|
| **Apagar só desta pasta** | `DELETE /api/criacao/pastas/:pastaId/musicas/:musicaId` | Remove vínculo `pasta_musica`; faixa **permanece** na biblioteca; reabre programação da pasta |
| **Apagar da biblioteca** | `DELETE /api/criacao/biblioteca/:musicaId` | Remove da biblioteca (regras existentes de delete) |

**Feedback UI:** `Pensando…` → `Ok, feito — Removida da pasta` ou `Removida da biblioteca`.

Arquivo: `components/criacao/CheckPanel.tsx` → `runPastaAction`.

---

## Arquivos do módulo

| Caminho | Papel |
|---------|--------|
| `components/criacao/CheckPanel.tsx` | UI: upload, resultados, ordenação, apagar |
| `lib/criacao/checkService.ts` | Sessão, tickets, enrich preview |
| `lib/criacao/checkLabels.ts` | Tipos, labels, cores, ordem |
| `lib/criacao/dedupeNormalize.ts` | Match CHECK (espelho documentação portal) |
| `.cloud2-stage/criacao/checkAnalyze.ts` | Análise, veredito, duração 10s |
| `.cloud2-stage/criacao/dedupe.ts` | Match CHECK no cloud2 |
| `.cloud2-stage/criacao/checkStorage.ts` | Scratch de arquivos |
| `app/api/criacao/check/*` | Rotas portal (session, ticket, enrich, pasta-tracks) |

---

## Deploy

| Peça | Comando / destino |
|------|-------------------|
| **Cloud2** (análise) | `bash scripts/deploy-cloud2-lufs.sh` — publica `.cloud2-stage/criacao/` |
| **Portal** (UI + labels) | `bash scripts/deploy-netlify-portal.sh` ou push `main` → Netlify |

Sempre **commit + push** antes de considerar permanente (ver `docs/REGISTRO-PORTAL-2026-08.md`).

---

## Histórico de mudanças (ago/2026)

| Data | Commit | Mudança |
|------|--------|---------|
| — | `4208482` | Ordenar “Faixa diferente” acima de “Revisar” (primeira iteração) |
| 18/08 | `48173b3` | Pareamento por **título núcleo** (Single Version, Live, etc.) — só CHECK |
| 18/08 | `9034c03` | Veredito **Possível versão ao vivo ou diferente**; duração parecida ≤10s no Revisar; ordem final; botões apagar pasta/biblioteca |

**Deploy 18/08/2026:** cloud2 OK · portal Netlify `6a84e01e` · `main` @ `9034c03`.

---

## Exemplos práticos

| Upload | Pasta | Resultado esperado |
|--------|-------|-------------------|
| `Strangelove (Single Version)` | `Strangelove` | Par encontrado → versão ao vivo/diferente ou revisar conforme áudio |
| `Enjoy The Silence (7" Version)` | `Enjoy The Silence` | Idem |
| `Beleza Pura` | `Beleza Pura (Live)` | **Possível versão ao vivo ou diferente** (roxo) |
| `Every Breath You Take` | `Every Breath You Take (Demo)` | Par + veredito conforme Chromaprint/duração |
| Nome totalmente diferente | — | Sem par na pasta |

---

## Retomar em chat novo

> Leia `docs/CRIACAO-CHECK.md`. CHECK em `/criacao/check`. Análise no cloud2; dedupe da fila **não** usa `ForCheck`.

Transcript (ago/2026): `.cursor/projects/.../agent-transcripts/ce8978ef-4b2f-4219-90be-4c1aa8ab60be.jsonl`
