# Registro Portal — agosto/2026 (deploy, WIP e handoff)

Documento para **não perder** o que foi feito, o que está no ar e o que ainda só existe no Mac.  
Leia no início de chat novo junto com `docs/ONDE-ESTAMOS.md`.

**Última atualização:** 18/08/2026  
**Repositório:** `Financeiroradioibiza/portal-cobranca-contaazul` · branch `main`  
**Portal produção:** https://portal.radioibiza.app.br  
**Netlify site:** `site-vencidos-ibiza` (`0107bc8a-2d4c-4c8f-a33f-8132779d9aee`)

---

## Por que “sumiu” coisa no passado

Três padrões que já aconteceram (chamados e-mail, seletor Cliente/PDV, shuffle, etc.):

| Causa | O que acontece | Como evitar |
|-------|----------------|-------------|
| **1. Deploy CLI sem commit** | `bash scripts/deploy-netlify-portal.sh` publica o disco local; no próximo `git push` + build Netlify, **volta** a versão do GitHub (mais antiga). | Sempre **`git commit` + `git push origin main`** antes de considerar “foi pro ar”. CLI só para emergência. |
| **2. Código só local (untracked)** | Feature implementada, nunca commitada; outro deploy sobrescreve produção. | Ver seção [WIP local](#wip-local-não-commitado-ago2026) abaixo; commitar por **escopo** (um assunto por commit). |
| **3. Push OK, build Netlify falhou** | GitHub tem o código; produção **não** atualizou (último deploy `ready` fica no commit anterior). | Após push, conferir Netlify: deploy do commit deve estar **`ready`**, não `error`. |

**Regra operacional (Rafael + agente):**

1. Implementar → `npm run build` local (ou worktree limpo do commit).  
2. `git add` **só** arquivos do escopo → `git commit` → `git push origin main`.  
3. Netlify → Deploys: último da branch `main` = **`Published` / ready**.  
4. Só então testar em https://portal.radioibiza.app.br (Ctrl+F5).

Preferir **push no GitHub** (CI Netlify ligado ao repo). O script `scripts/deploy-netlify-portal.sh` existe só para emergência e **não substitui** commit.

---

## O que está NO AR agora (18/08/2026)

Último deploy Netlify **bem-sucedido (`ready`)**:

| Campo | Valor |
|-------|--------|
| **Commit** | `9034c03` |
| **Mensagem** | `feat(criacao): CHECK veredito versão ao vivo, ordem e ações na pasta` |
| **Deploy ID** | `6a84e01e` |
| **Inclui** | CHECK: categoria roxa “Possível versão ao vivo ou diferente”; duração parecida ≤10s no Revisar; ordem dos resultados; botões apagar pasta/biblioteca; site-cliente cobrança (commits `97ae616`–`f798785`) |

**Cloud2** (mesmo dia): deploy OK com `48173b3` + `9034c03` — `checkAnalyze.ts`, `dedupe.ts` (pareamento título núcleo + vereditos CHECK).

Doc completa do CHECK: **`docs/CRIACAO-CHECK.md`**

---

## Commits recentes em `main` (ago/2026)

| Commit | Resumo | Deploy Netlify |
|--------|--------|----------------|
| `9034c03` | CHECK: veredito ao vivo/diferente, ordem, apagar pasta/biblioteca | ready (`6a84e01e`) |
| `48173b3` | CHECK: pareia título núcleo vs `(Single Version)` etc. (só CHECK) | cloud2 |
| `97ae616` | Site-cliente: `grupoTipo` pelo banco (Ofner cobrança) | ready |
| `f798785` | Site-cliente Fase B cobrança | ready |
| `32052f2` | Chamados: e-mail `chamados@` + Assunto livre / Cliente / PDV | (verificar) |
| `61f9c67` | Disparo fechar atualização em lotes (504) | ready |
| `c87d905` | Cronograma Shuffle (pastas por mês) | ready |
| `9b54d8b` | API `POST programacoes/:id/duplicar` | ready |
| `a7ff43c` | E-mail instalação 3: botão guia Player 5 | ready |
| `e58e82d` | Tag Rio **CORTESIA** (não bloqueia player) | ready |
| `c3aea56` | Modal fechar atualização scroll (muitos PDVs) | ready (houve 1 error antes, rebuild OK) |
| `4208482` | CHECK: ordenar “Faixa diferente” acima de “Revisar” (primeira iteração) | (supersedido por `9034c03`) |

Histórico completo: `git log --oneline -20 origin/main`

---

## CHECK — aperfeiçoamentos (18/08/2026)

Ver **`docs/CRIACAO-CHECK.md`** (documento canônico).

Resumo do que entrou em produção (`48173b3` + `9034c03`):

1. **Pareamento título núcleo** — upload `(Single Version)` / `(Live)` / `(7" Version)` pareia com pasta limpa; artista tolerante (`The Police/Police`).
2. **Nova categoria roxa** — “Possível versão ao vivo ou diferente” quando só um lado tem Live, Remix, Remaster, Reloaded, etc.
3. **Revisar** — duração ≤10s → check verde “Duração parecida”.
4. **Ordem** — Faixa diferente → versão ao vivo → Revisar → Sem par (OK no topo).
5. **Ações** — apagar só da pasta ou da biblioteca no card expandido (Pensando… → Ok, feito).

**Não altera** dedupe da fila nem player.

---

## Chamados — o que foi pedido e implementado

### 1. E-mail ao abrir chamado (`32052f2`)

- **Remetente:** `chamados@radioibiza.com.br` (perfil SMTP `chamados` em `lib/email/ocSmtp.ts`).
- **Destinatários:** responsáveis marcados + usuários ativos dos **setores** selecionados (`resolveChamadoNotifyRecipients` em `lib/chamados/chamadoNotifyEmail.ts`).
- **Dispara em:** `createChamado` (portal), feedback Player 5 (`app/api/player/ingest/feedback/route.ts`). Pedidos/comprovante site-cliente **fora** deste commit (WIP separado).
- **Netlify env** (já configuradas pelo Rafael):  
  `OC_EMAIL_SMTP_USER_CHAMADOS`, `OC_EMAIL_SMTP_PASS_CHAMADOS`, `OC_EMAIL_FROM_CHAMADOS`, `OC_EMAIL_FROM_NAME_CHAMADOS`, etc. (ver `.env.example`).

### 2. Vínculo Cliente / PDV / Assunto livre (`32052f2`)

- **UI:** `components/chamados/ChamadoProducaoVinculoFields.tsx` dentro do modal em `ChamadosBoard.tsx`.
- **Modos:** Assunto livre | Cliente | PDV (catálogo **Produção**, não Planilha Rio).
- **API:** `GET /api/chamados/producao-opcoes?q=…` → `lib/chamados/chamadoProducaoOpcoes.ts`.
- **Grava:** `rioLinhaId`, `rioPdvKey`, `clienteNome` no chamado; assunto preenchido automaticamente.

**Arquivos do commit `32052f2`:**  
`chamadoNotifyEmail.ts`, `chamadoUtils.ts`, `chamadoProducao*.ts`, `ChamadoProducaoVinculoFields.tsx`, `producao-opcoes/route.ts`, `ChamadosBoard.tsx`, `chamadoService.ts`, `ocSmtp.ts`, `feedback/route.ts`, `playerIngestService.ts`, `.env.example`.

---

## Criação — disparo 504 (Lofty Style ~62 PDVs)

**Problema:** `POST .../disparar-atualizacao` → 504 (Netlify ~26s); publicar + 7 lotes de PDVs numa request.

**Solução (`61f9c67`):**

1. `dispararAtualizacao` → `publicarProgramacao(..., { skipPdvLink: true })`.
2. Resposta inclui `pdvAmarracaoLotes`.
3. UI chama `POST .../disparar-atualizacao/amarrar-pdvs` com `{ batchIndex }` por lote.
4. Modal: “Publicando…” → “Amarrando lojas 1/7…”.

**Não mexer** sem OK: player, cloud2 loop, publicação existente.

---

## WIP local (não commitado) — ago/2026

~90 paths alterados no Mac; **não** estão em produção. Principais blocos:

| Área | O que tem local | Observação |
|------|-----------------|------------|
| **Site cliente / cobrança** | `app/api/site-cliente/cobranca/*`, `sites/site-cliente/public/cobranca.*`, migrations `20260814140000_*`, `20260814180000_*` | Escopo grande; separar commit próprio |
| **Comprovante → chamado** | `lib/site-cliente/siteClienteCobrancaComprovanteService.ts`, `app/api/chamados/comprovante/` | Ficou **fora** do `32052f2` de propósito |
| **Suporte site-clientes** | `escopo-cobranca`, `catalog-cobranca`, `SiteClientesAdminPanel` | Untracked + modified |
| **Cobrança aberta** | `email-template`, `preview`, `send` | Modified |
| **Cloud2 stage** | `.cloud2-stage/*` | Modified — deploy cloud2 separado |
| **Prisma schema** | `schema.prisma` WIP | **Não** commitar junto com portal sem migration alinhada |
| **Scripts debug** | `.criacao-*.run.cjs`, `check-*.ts` na raiz | Temporários; não commitar |

Conferir sempre: `git status --short`

---

## Checklist “foi pro ar?”

```bash
# 1. Commit existe no GitHub?
git log -1 --oneline origin/main

# 2. Netlify deploy desse commit = ready?
# Painel: site-vencidos-ibiza → Deploys
# Ou CLI (se linkado):
npx netlify api listSiteDeploys --data '{"site_id":"0107bc8a-2d4c-4c8f-a33f-8132779d9aee","per_page":5}'

# 3. UI em produção bate com o commit?
# Ex.: chamados devem ter "Vínculo (Produção)", não só "Título" com placeholder vinheta
```

---

## Como retomar em chat novo

Cole:

> Repo `portal-cobranca-contaazul`. Leia `docs/REGISTRO-PORTAL-2026-08.md` e `docs/ONDE-ESTAMOS.md`.  
> Produção está em `<commit ready>`; pendente redeploy de `<commit se houver error>`.  
> [sua tarefa]

**Transcript longo (ago/2026):**  
`.cursor/projects/.../agent-transcripts/ce8978ef-4b2f-4219-90be-4c1aa8ab60be.jsonl`

---

## Pendências imediatas (18/08/2026)

1. Validar CHECK em cliente real (ex. Depeche Mode, Caetano) após deploy `9034c03`.  
2. Conferir se chamados `32052f2` (e-mail + Cliente/PDV) já estão no ar no deploy `6a84e01e`.  
3. Commits separados para WIP restante (comprovante → chamado, etc.) — não misturar com criação/player.

---

## Referências

| Doc | Conteúdo |
|-----|----------|
| `docs/ONDE-ESTAMOS.md` | Visão geral módulos (atualizar datas quando possível) |
| `docs/CRIACAO-CHECK.md` | CHECK: pareamento, vereditos, UI, deploy |
| `docs/CRIACAO-ATUALIZACAO-PROGRAMACAO.md` | Fechar/publicar programação |
| `docs/SITE-CLIENTE-PRODUCAO.md` | Site cliente Netlify separado |
| `.cursor/rules/producao-segura-player.mdc` | Não regredir player/cronogramas |
| `scripts/deploy-netlify-portal.sh` | Deploy manual emergência (exige commit antes) |
