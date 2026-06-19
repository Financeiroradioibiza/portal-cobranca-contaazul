# Piloto Player 5 — passo a passo

Objetivo: **um cliente de teste** tocando música no Player 5 via portal novo + cloud2.

Referência: [`PLAYER5-INTEGRACAO.md`](./PLAYER5-INTEGRACAO.md) · contrato em `radio-ibiza-player-5/PROTOCOLO_WEBSERVICE.md`

---

## Pré-requisitos

### Neon (portal)

```bash
npx prisma migrate deploy
```

Migrations Player 5 (entre outras): `portal_player_ids`, `player_login_stable_serial`, `player_aviso_operador`, `player_contato_extra_codigo`, `player_cliente_logotipo`.

### Cloud2 (gateway)

- Publicar `.cloud2-stage/` no servidor (webservice + player-registry + publicar)
- Variáveis: `DATABASE_URL`, `PORTAL_DATABASE_URL`, `CLOUD2_INGEST_SECRET` / `CRIACAO_INGEST_SECRET`
- URL pública: `API_PUBLIC_BASE_URL` ou `CLOUD2_PUBLIC_URL` (ex.: `https://cloud2.radioibiza.app.br`)

### Portal (Netlify / local)

| Variável | Uso |
|----------|-----|
| `CLOUD2_BASE_URL` | Sync + publicar programação |
| `CLOUD2_INGEST_SECRET` | Autenticação portal → cloud2 |
| `CLOUD2_PUBLIC_URL` | Piloto / probes (opcional) |

### Player 5 (build PWA)

| Variável | Valor típico |
|----------|----------------|
| `VITE_WEBSERVICE_URL` | `https://cloud2.radioibiza.app.br/api/` |
| `VITE_PLAYER_AVISOS_URL` | `https://cloud2.radioibiza.app.br/api/player-avisos` |

Sem `VITE_PLAYER_AVISOS_URL`, avisos operador do Suporte não aparecem no player (resto funciona).

---

## Passos no portal (ordem)

| # | Onde | Ação |
|---|------|------|
| 1 | **Cadastros → IDs Player** | «Atribuir IDs faltantes» → «Sincronizar Player 5» |
| 2 | **Suporte → Logins clientes** | «Gerar logins faltantes» (anote e-mail + senha de **um** cliente teste) |
| 3 | **Produção → Cadastro PDV** | Chave serial + flags controle + programação musical (nome = programação publicada) |
| 4 | **IDs Player** (opcional) | Logotipo JPEG do cliente + sync |
| 5 | **Criação → Programações** | MP3 → pastas → **Publicar no Player 5** (cliente gateway = ID do passo 1) |
| 6 | **Suporte → Avisos player** (opcional) | Mensagem vermelha por par cliente/PDV |
| 7 | **Cadastros → IDs Player** | **Verificar piloto** |

---

## No Player 5

1. Login com e-mail/senha do cliente teste  
2. Escolher PDV (ou instalar com **chave serial** se 1ª vez)  
3. Aguardar download da playlist  
4. Tocar — áudio vem de `GET /api/get_musica/` no cloud2  

Se `atualizacao_pendente='S'` após publicar, o player refaz `/playlist/` no próximo ping (até 60 min) ou ao recarregar.

---

## Verificação API (manual)

```bash
# Login legado (mesmo contrato do Player 5)
curl -s -X POST 'https://cloud2.radioibiza.app.br/api/login/' \
  -d 'email=CLIENTE@radioibiza.com.br&password=SENHA'

# Token → perfil PDV
curl -s 'https://cloud2.radioibiza.app.br/api/loginByToken/?token=CHAVE_SERIAL'

# Playlist
curl -s 'https://cloud2.radioibiza.app.br/api/playlist/?token=CHAVE_SERIAL'

# Avisos operador
curl -s -X POST 'https://cloud2.radioibiza.app.br/api/player-avisos' \
  -H 'Content-Type: application/json' \
  -d '{"token":"CHAVE_SERIAL","cliente_id":100,"pdv_id":100001}'
```

Portal: `GET /api/player/pilot` — checklist do Neon + gateway.

---

## Programação por PDV

Campo **Programação musical** no cadastro PDV deve coincidir com o **nome** da programação publicada no gateway (`programas.nome`). No sync, o portal grava `pdvs.programa_id` e o webservice usa esse programa em `/playlist/`, `/agendas/` e vinhetas.

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| `usuario_invalido` | Sync não rodou ou `usuarios` vazio → «Sincronizar Player 5» |
| `token_invalido` | Serial não syncada ou PDV inativo |
| `programa_nao_encontrado` | Programação não publicada ou nome do cadastro ≠ nome publicado |
| Playlist vazia | Publicar sem MP3 processado (`semArquivo` > 0) |
| MP3 não baixa | `storage_key` ausente ou CORS no cloud2 |
| Avisos não aparecem | `VITE_PLAYER_AVISOS_URL` ausente no build do Player 5 |
| Logo não aparece | Upload em IDs Player + sync; JPEG válido |

---

*Integração código concluída no portal — falta deploy cloud2 + migrate Neon + build Player 5 apontando ao cloud2.*
