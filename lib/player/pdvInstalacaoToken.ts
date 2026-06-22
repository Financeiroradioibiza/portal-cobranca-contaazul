import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreatePdvCadastro } from "@/lib/cadastros/producaoPdvCadastroService";

/** Gera chave serial compatível com o fluxo legado (hex 32 chars). */
export function newPlayerInstalacaoToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function ensurePdvInstalacaoToken(rioPdvKey: string): Promise<string> {
  const map = await ensureInstalacaoTokensForKeys([rioPdvKey]);
  const token = map.get(rioPdvKey);
  if (!token) throw new Error("falha_gerar_token");
  return token;
}

const TOKEN_UPSERT_CHUNK = 20;

/** Gera tokens em lote (1 conexão por chunk) — evita estourar o pool no sync Player 5. */
export async function ensureInstalacaoTokensForKeys(
  rioKeys: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(rioKeys.map((k) => k.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const rows = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: unique } },
    select: { rioPdvKey: true, playerInstalacaoToken: true },
  });
  for (const row of rows) {
    const t = row.playerInstalacaoToken.trim();
    if (t) out.set(row.rioPdvKey, t);
  }

  const needToken = unique.filter((k) => !out.has(k));
  for (let i = 0; i < needToken.length; i += TOKEN_UPSERT_CHUNK) {
    const chunk = needToken.slice(i, i + TOKEN_UPSERT_CHUNK);
    const pending = chunk.map((rioPdvKey) => {
      const token = newPlayerInstalacaoToken();
      out.set(rioPdvKey, token);
      return prisma.producaoPdvCadastro.upsert({
        where: { rioPdvKey },
        create: { rioPdvKey, playerInstalacaoToken: token },
        update: { playerInstalacaoToken: token, playerInstaladoEm: null },
      });
    });
    await prisma.$transaction(pending);
  }

  return out;
}

/** Gera nova chave — desamarra instalação anterior (como «refazer serial» no painel legado). */
export async function regenerarPdvInstalacaoToken(rioPdvKey: string): Promise<string> {
  await getOrCreatePdvCadastro(rioPdvKey, { refreshCobranca: false });
  const token = newPlayerInstalacaoToken();
  await prisma.producaoPdvCadastro.update({
    where: { rioPdvKey },
    data: { playerInstalacaoToken: token, playerInstaladoEm: null },
  });
  return token;
}
