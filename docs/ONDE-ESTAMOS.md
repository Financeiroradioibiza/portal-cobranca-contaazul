# Onde estamos — Radio Ibiza (portal + produção)

Documento de referência do estado do projeto em **28/05/2026**.  
Atualize este arquivo quando houver marco importante (deploy, servidor Envyron, piloto de players).

**Site em produção (portal admin):** https://site-vencidos-ibiza.netlify.app  
**Repositório GitHub:** `Financeiroradioibiza/portal-cobranca-contaazul` (branch `main`)

---

## 1. Visão geral — o que estamos construindo

Um **portal único de operação** (Next.js + Postgres/Neon) que reúne:

| Área | Foco | Fonte de verdade |
|------|------|------------------|
| **Cobrança / financeiro** | Conta Azul, cobranças, OC, planilha por competência | API Conta Azul + `rio_comp_*` |
| **Cadastros** | Cruzar cobrança (Rio) com produção musical (layout editorial) | Planilha Rio + vínculos legado |
| **Produção** | Base operacional dos PDVs (dashboard, suporte) | Postgres + cadastro produção |
| **Webservice players** *(futuro, separado)* | Música, playlist, ping — ~4.000 players hoje no Cake | Legado Cake → depois `portal-ibiza` na Envyron |

**Regra de ouro:** Planilha Rio manda **quem paga** (cliente, CNPJ, valor, contrato).  
Produção musical organiza **o que toca** (programação, playlist, player) — hierarquia diferente.

---

## 2. Mapa do portal (Netlify)

### Cobrança — `/cobranca/*`

| Rota | Função |
|------|--------|
| `/cobranca/vencidos` | Clientes com parcelas vencidas/em aberto (Conta Azul) |
| `/cobranca/planilha-rio` | Planilha Rio por competência (MARCA, PDVs, sync CA, virada) |
| `/cobranca/envios-oc` | Envios manuais de pedido de OC (e-mail + anexo) |
| `/cobranca/consulta-painel` | Consulta ao painel legado Cake (cliente/PDV por nome ou ID) |

URLs antigas (`/`, `/planilha-rio`, `/manual`) redirecionam para estas rotas.

### Cadastros — `/cadastros/*`

| Rota | Função |
|------|--------|
| `/cadastros/grupos` | Layout produção: Rio (cobrança) × grupos editoriais (HERING, etc.) |
| `/cadastros/vinculos` | Lista e gestão de vínculos Rio PDV ↔ painel legado (`painel_pdv_id`) |

### Produção — `/producao/*`

| Rota | Função |
|------|--------|
| `/producao/dashboard` | Visão dos clientes/PDVs de produção (lotes, expandir, versão player) |
| `/producao/suporte` | Contatos e dados operacionais por PDV |

---

## 3. Legado em produção (não mexer sem plano)

| Sistema | Onde | Papel |
|---------|------|--------|
| **Painel admin Cake** | `painel.radioibiza.com.br` | CRUD clientes, PDVs, programação, playlists (~15 anos) |
| **Webservice players Cake** | `cloud.radioibiza.com.br` / `envyron.radioibiza.com.br` | ~4.000 players: login, playlist, ping, músicas |
| **MySQL legado** | Digital Ocean (mesmo ecossistema Cake) | Banco do painel legado |
| **Player 4 produção** | Netlify (`player4.radioibiza.com.br`) | Aponta para **Cake** — **não alterar** sem aprovação |

Código legado analisado: extraído de `www.zip` → `/Users/rafaelagasparian/Documents/radioibiza-legacy-www/www`  
Controller principal dos players: `services/app/Controller/WebserviceController.php`

---

## 4. Projetos locais (Mac)

| Pasta | Conteúdo |
|-------|----------|
| `~/Documents/portal-cobranca-contaazul` | **Este repo** — portal admin (cobrança, cadastros, produção UI) |
| `~/Documents/playeribiza2015-2026/portal-ibiza` | API nova compatível com protocolo do webservice legado |
| `~/Documents/playeribiza2015-2026/radio-ibiza-player-4` | Player novo (PWA/Electron) + docs de protocolo |
| `~/Documents/radioibiza-legacy-www` | Cópia do CakePHP legado (referência) |
| `~/Documents/portal-cobranca-contaazul/data/export-clientes.csv` | Export do painel para busca por nome (atualizar e redeploy) |

Documentação do player: `radio-ibiza-player-4/PROTOCOLO_WEBSERVICE.md`, `DECISIONS.md`, `infra/portal-sandbox/docker-compose.yml`

---

## 5. Banco de dados (Neon Postgres — portal)

Principais tabelas:

| Grupo | Tabelas | Uso |
|-------|---------|-----|
| Conta Azul | `ContaAzulToken`, `ClientPortalMeta` | OAuth, obs/contrato no painel vencidos |
| Envios OC | `ManualReminder*`, `OcEmailTemplate` | Planilha envios manuais |
| Cobrança aberta | `CobrancaAbertaEmailTemplate` | E-mail agregado vencidos |
| Planilha Rio | `rio_comp_*` | Competência, MARCA, clientes, PDVs |
| Ponte legado | `painel_pdv_link` | Rio PDV ↔ ID painel Cake |
| Produção | `cadastro_producao_layout`, `producao_pdv_cadastro` | Layout editorial + ficha PDV |

**Importante:** o Postgres do portal **não** é o MySQL do Cake. **Não** compartilhar banco com `portal-ibiza` no Envyron (Postgres local ao Docker lá).

---

## 6. Estratégia acordada — dois trilhos em paralelo

```
HOJE (produção musical)
  Players antigos (~4000) ──► Cake (DO) ──► MySQL legado

PORTAL ADMIN (já no ar)
  Equipe financeira/operação ──► Netlify ──► Neon Postgres

PRÓXIMO PASSO (aguardando servidor Envyron)
  portal-ibiza (Docker) ──► Postgres SÓ DELE ──► subdomínio NOVO
  Players NOVOS entram aqui aos poucos
  Cake continua intocado para os antigos
```

### Cinco ilhas — não misturar

1. Cake legado (DO) — produção musical hoje  
2. Player 4 produção (Netlify) — aponta Cake  
3. Portal cobrança/cadastros/produção (Netlify) — Neon  
4. Webservice novo (`portal-ibiza` na Envyron) — ilha nova  
5. Player teste (opcional, Netlify separado) — só quando quiser piloto  

**Evitar:** alterar `netlify.toml` do player4; usar Neon do cobrança no webservice de música; deploy que toque tudo junto.

---

## 7. O que já está pronto vs pendente

### Feito (portal Netlify)

- OAuth Conta Azul, painel vencidos, e-mail cobrança, contratos  
- Planilha Rio v2: sync CA, MARCA, PDVs, virada, import CSV, export mês, export PDV por cliente  
- Envios manuais OC (SMTP, anexo, cron opcional)  
- Consulta painel (scraping + CSV export-clientes)  
- Módulo Cobrança em `/cobranca/*`  
- Cadastros: grupos & clientes, vínculos Rio ↔ painel  
- Produção: dashboard + suporte  
- Visão Fase 2: `docs/FASE-2-PRODUCAO-MUSICAL.md`

### Pendente (próximo marco)

| Item | Dependência |
|------|-------------|
| Servidor Envyron (Ubuntu + Docker) | IP, SSH, subdomínio, HTTPS |
| Deploy **só** `portal-ibiza` no Envyron | Servidor acima |
| Health + login via curl no staging | Deploy acima |
| Piloto com 1 player novo no trilho novo | Aprovação explícita |
| Gateway compat completo (playlist, ping, …) | Fase 2.3 do doc FASE-2 |
| Sync portal-cobranca ↔ portal-ibiza | Muito depois — bancos separados |

**Quando o servidor estiver pronto, enviar:** IP, usuário SSH, subdomínio, quem configura HTTPS.

---

## 8. Hierarquias (dois mundos)

### Cobrança — Planilha Rio

```
MARCA (bloco faturamento)
 └── Cliente (Conta Azul / contrato)
      ├── 1 PDV
      └── N PDVs
```

### Criação — produção musical

```
Cliente operacional
 └── Programação musical (playlist)
      └── PDVs agrupados por programação
```

**Cadastros** = cruzamento: mesmo PDV físico, duas organizações diferentes.

---

## 9. Deploy e operação

- **Portal:** push em `main` → Netlify build automático  
- **Migrations:** `npx prisma migrate deploy` (Neon)  
- **Scripts pesados Rio:** `npm run rio:apply-marca-layout`, `npm run rio:revert-sync` (local)  
- **Backup:** `docs/BACKUP-E-RESTAURACAO.md` e `scripts/backup-radio-ibiza-local.sh`

---

## 10. Histórico de decisões relevantes

| Data | Decisão |
|------|---------|
| 2026-05 | Portal cobrança em Netlify + Neon; Conta Azul OAuth |
| 2026-05 | Planilha Rio v2 (`rio_comp_*`) |
| 2026-05 | Análise `www.zip` — mapa Cake + webservice players |
| 2026-05 | Cadastros — `painel_pdv_link`, layout produção |
| 2026-05 | Produção dashboard + suporte |
| 2026-05-28 | FASE-2 documentada; migração paralela legado + trilho novo |
| 2026-05 (sexta) | Envyron: Ubuntu + Docker; deploy isolado `portal-ibiza` |
| 2026-05 (sexta) | Separar ambientes — não misturar player4, Neon e API nova |
| Pendente | SSH Envyron → primeiro deploy staging |

---

## 11. Documentos relacionados

| Arquivo | Conteúdo |
|---------|----------|
| `docs/FASE-2-PRODUCAO-MUSICAL.md` | Visão arquitetura produção + webservice |
| `docs/BACKUP-E-RESTAURACAO.md` | Backup código, banco e configs |
| `README.md` | Variáveis de ambiente e fluxos técnicos |
| `playeribiza2015-2026/.../PROTOCOLO_WEBSERVICE.md` | Contrato HTTP player ↔ painel |

---

*Última atualização: 28/05/2026. Mantenha este arquivo como referência entre conversas.*
