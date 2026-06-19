# Criação musical — atualização de programação (disparo + log)

Fluxo operacional para **atualizações mensais** de programação já publicada no Player.

**Status:** implementado (Fase A — portal)  
**Relacionado:** [`CRIACAO-PROCESSAMENTO-MUSICAL.md`](CRIACAO-PROCESSAMENTO-MUSICAL.md), `publicarProgramacao`, `dispararAtualizacao`

---

## 1. Como funciona na operação

1. A programação fica **sempre editável** no portal (pastas, faixas, vinhetas). Vários usuários podem ir ajustando aos poucos.
2. Quando quiserem levar o estado atual ao ar, clicam **Disparar atualização** na **Central de programações** (ao lado de cada programação).
3. O disparo é **imediato**: publica no gateway (Player 5) e grava um registro no **log** com o que entrou e saiu desde o último disparo.
4. Não há fluxo de “abrir/fechar edição”, “cancelar atualização” ou limite de uma atualização por vez.

---

## 2. Nome automático da atualização

Código gerado no disparo:

`{ClienteSlug}-ATL-{Mês}-{YY}.{seq}`

Exemplos (fuso `America/Sao_Paulo`):

| Disparo | Código |
|---------|--------|
| 1ª de junho/2026 | `Radiolbiza-ATL-Junho-26.01` |
| 2ª no mesmo mês | `Radiolbiza-ATL-Junho-26.02` |

- `ClienteSlug`: nome do cliente sem acentos/espaços (até 32 chars).
- Sequência `.01`, `.02`, … reinicia por **programação + mês + ano**.

---

## 3. Log (entraram / saíram)

Em cada programação na Central, botão **Log de atualizações** (abaixo das pastas/vinhetas):

- Lista histórico (até 100 registros), mais recente primeiro.
- Cada linha: código, revisão, data/hora, quem disparou, contagem +/−.
- Expandir mostra listas **Entraram** e **Saíram** (título, artista, pasta).

O diff compara o **snapshot** salvo no último disparo com o estado atual no momento do novo disparo.

---

## 4. Modelo de dados

### `programacao` (campos extras)

| Campo | Uso |
|-------|-----|
| `revision_atual` | Número da última revisão disparada |
| `cliente_gateway_id` | Cliente Player 5 usado |
| `snapshot_atual` | JSON `{ faixas: { musicaId → { titulo, artista, pastaNome } } }` |

### `programacao_atualizacao`

| Campo | Uso |
|-------|-----|
| `codigo` | Ex.: `Radiolbiza-ATL-Junho-26.01` |
| `revision` | Revisão após este disparo |
| `disparada_em` / `disparada_por` | Auditoria |
| `diff_json` | `{ entraram, sairam }` |
| `snapshot_json` | Snapshot completo após disparo |
| `musicas_publicadas` / `playlists_publicadas` | Resumo do gateway |

---

## 5. APIs

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/criacao/programacoes/[id]/disparar-atualizacao` | Dispara (body opcional `{ clienteIdGateway }`) |
| `GET` | `/api/criacao/programacoes/[id]/atualizacoes` | Lista log |

Serviço: `lib/criacao/atualizacaoService.ts` — `dispararAtualizacao`, `listAtualizacoesLog`, `gerarCodigoAtualizacao`.

---

## 6. UI

**Central de programações** (`ProgramacoesAdminPanel`):

- Botão **Disparar atualização** na linha de ações de cada programação (junto a Editor completo, + pasta, + vinheta).
- Modal de confirmação + seleção de cliente gateway (igual espírito do modal Publicar).
- **Log de atualizações** expansível no rodapé de cada programação.

---

## 7. Gateway / player (Fase B)

MVP reutiliza `publicarProgramacao` (mesmo motor da 1ª publicação). Próximo passo: player consultar `revision_atual` para saber quando baixar nova playlist.

---

## 8. Publicar vs Disparar atualização

| | **Publicar (1ª vez)** | **Disparar atualização** |
|--|----------------------|---------------------------|
| Onde | Editor de programação | Central de programações |
| Quando | Programação nova | Sempre que quiser sincronizar + registrar log |
| Efeito | Cria/atualiza playlists no gateway | Idem + revisão + diff + código ATL |

---

*Atualizado em 2026-06-20 conforme fluxo simplificado (edição livre, disparo imediato, log por nome).*
