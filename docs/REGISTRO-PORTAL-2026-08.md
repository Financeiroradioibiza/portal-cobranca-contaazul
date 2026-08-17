# Registro Portal — agosto/2026 (deploy, WIP e handoff)

Documento para **não perder** o que foi feito, o que está no ar e o que ainda só existe no Mac.  
Leia no início de chat novo junto com `docs/ONDE-ESTAMOS.md`.

**Última atualização:** 17/08/2026  
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

## O que está NO AR agora (17/08/2026 ~16h)

Último deploy Netlify **bem-sucedido (`ready`)**:

| Campo | Valor |
|-------|--------|
| **Commit** | `61f9c67` |
| **Mensagem** | `fix(criacao): disparo em lotes para evitar 504 com muitos PDVs` |
| **Inclui** | Publicar no gateway numa request; amarrar PDVs em `/disparar-atualizacao/amarrar-pdvs` por lote de 10; modal com progresso |

**Não está no ar** (commit no GitHub, deploy **falhou**):

| Campo | Valor |
|-------|--------|
| **Commit** | `32052f2` |
| **Mensagem** | `feat(chamados): e-mail na criação e vínculo opcional Cliente/PDV` |
| **Netlify** | `error` — build exit code 2 (~18:39 UTC 17/08) |
| **Sintoma** | Modal “Novo chamado” ainda mostra só **Título** (versão antiga), sem **Vínculo (Produção)** |

Build limpo do `32052f2` **passa** localmente (`npm ci && npm run build` em worktree). Falha provavelmente intermitente ou ambiente Netlify — **redeploy necessário**.

---

## Commits recentes em `main` (ago/2026)

| Commit | Resumo | Deploy Netlify |
|--------|--------|----------------|
| `32052f2` | Chamados: e-mail `chamados@` + Assunto livre / Cliente / PDV | **error** |
| `61f9c67` | Disparo fechar atualização em lotes (504) | ready |
| `c87d905` | Cronograma Shuffle (pastas por mês) | ready |
| `9b54d8b` | API `POST programacoes/:id/duplicar` | ready |
| `a7ff43c` | E-mail instalação 3: botão guia Player 5 | ready |
| `e58e82d` | Tag Rio **CORTESIA** (não bloqueia player) | ready |
| `c3aea56` | Modal fechar atualização scroll (muitos PDVs) | ready (houve 1 error antes, rebuild OK) |
| `4208482` | CHECK: ordenar “Faixa diferente” acima de “Revisar” | (ver histórico Netlify) |

Histórico completo: `git log --oneline -20 origin/main`

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

## Pendências imediatas (17/08/2026)

1. **Redeploy / corrigir build** do commit `32052f2` (chamados e-mail + Cliente/PDV).  
2. Validar chamado teste → e-mail `chamados@` + UI vínculo.  
3. Commits separados quando for deployar WIP site-cliente / comprovante (não misturar com criação/player).

---

## Referências

| Doc | Conteúdo |
|-----|----------|
| `docs/ONDE-ESTAMOS.md` | Visão geral módulos (atualizar datas quando possível) |
| `docs/CRIACAO-ATUALIZACAO-PROGRAMACAO.md` | Fechar/publicar programação |
| `docs/SITE-CLIENTE-PRODUCAO.md` | Site cliente Netlify separado |
| `.cursor/rules/producao-segura-player.mdc` | Não regredir player/cronogramas |
| `scripts/deploy-netlify-portal.sh` | Deploy manual emergência (exige commit antes) |
