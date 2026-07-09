# Servidor UP (agente local)

Scan de pastas legado, **ffprobe** (duração) e inventário de MP3 no **seu PC**.
O portal coordena; este app lê o disco local.

## Requisitos

- Python 3.11+
- **ffmpeg** no PATH (`brew install ffmpeg` no Mac)

## Uso rápido (duplo clique)

| SO | Arquivo |
|----|---------|
| **Mac** | `Iniciar-ServidorUP.command` (botão direito → Abrir na 1ª vez) |
| **Windows** | `Iniciar-ServidorUP.bat` |

Deixe a janela aberta. No portal: **Criação → Servidor UP**.

**Primeira vez:** abra [https://127.0.0.1:8766/health](https://127.0.0.1:8766/health), aceite o certificado local e recarregue o portal.

## Terminal

```bash
cd tools/servidor-up
chmod +x start.sh Iniciar-ServidorUP.command
./start.sh
```

## Estrutura esperada no HD

```
LegadoTeste/
├── Teste Portal/          ← cliente
│   └── TESTELEGADO1/      ← programação
│       ├── Bossa Remake/  ← pasta
│       │   └── Artista - Musica.mp3
│       └── Brasil/
└── Radioibiza/
    └── TESTELEGADO2/
        └── POP/
```

Pode haver uma pasta raiz extra (ex. `LegadoTeste/`); o portal usa os **3 últimos níveis** antes do `.mp3`.

## API local (porta 8766)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status e capacidades |
| GET/POST | `/config` | Pasta raiz no PC |
| POST | `/scan/paths` | Lista caminhos MP3 |
| POST | `/scan/inventory` | MP3 + ffprobe + metadados |

## Fluxo no portal

1. **Passo 0** — Conferir hierarquia legado × portal (criar pastas/programações faltantes)
2. **Passo 1** — Inventário (scan + duração)
3. **Passo 2** — Match Deezer + conferência de duração
4. **Passo 3** — Revisão de ambíguos
5. **Passo 4** — Download Deemix (cloud2) + fila de processamento

## Variável no portal (opcional)

```env
NEXT_PUBLIC_SERVIDOR_UP_URL=https://127.0.0.1:8766
```
