# Piloto Player 5 — passo a passo

Objetivo: **um cliente de teste** tocando música no Player 5 via portal novo + cloud2.

Referência: [`PLAYER5-INTEGRACAO.md`](./PLAYER5-INTEGRACAO.md) · contrato em `radio-ibiza-player-5/PROTOCOLO_WEBSERVICE.md`

---

## Pré-requisitos

- Migrations Neon aplicadas (`npx prisma migrate deploy`)
- `.cloud2-stage/` publicado no cloud2 (webservice + player-registry + publicar)
- Variáveis portal: `CLOUD2_BASE_URL`, `CLOUD2_INGEST_SECRET`, opcional `CLOUD2_PUBLIC_URL`
- Player 5 apontando para `https://cloud2.radioibiza.app.br/api/` (ou URL de teste)

---

## Passos no portal (ordem)

| # | Onde | Ação |
|---|------|------|
| 1 | **Cadastros → IDs Player** | «Atribuir IDs faltantes» → «Sincronizar Player 5» |
| 2 | **Suporte → Logins clientes** | «Gerar logins faltantes» (anote e-mail + senha de **um** cliente teste) |
| 3 | **Produção → Cadastro PDV** | Confirme **chave serial**; copie para instalação |
| 4 | **Criação → Programações** | Processe MP3s → monte pastas → **Publicar no Player 5** (cliente gateway = ID do passo 1) |
| 5 | **Cadastros → IDs Player** | Botão **Verificar piloto** (checklist automático) |

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
```

Portal: `GET /api/player/pilot` — checklist do Neon + gateway.

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| `usuario_invalido` | Sync não rodou ou `usuarios` vazio → «Sincronizar Player 5» |
| `token_invalido` | Serial não syncada ou PDV inativo |
| `programa_nao_encontrado` | Programação não publicada para esse `cliente_id` |
| Playlist vazia | Publicar sem MP3 processado (`semArquivo` > 0) |
| MP3 não baixa | `storage_key` ausente ou CORS no cloud2 |

---

*Atualizar após cada deploy cloud2.*
