import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreatePdvCadastro } from "@/lib/cadastros/producaoPdvCadastroService";

/** Gera chave serial compatível com o fluxo legado (hex 32 chars). */
export function newPlayerInstalacaoToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function ensurePdvInstalacaoToken(rioPdvKey: string): Promise<string> {
  const cad = await getOrCreatePdvCadastro(rioPdvKey, { refreshCobranca: false });
  if (cad.playerInstalacaoToken.trim()) return cad.playerInstalacaoToken;

  const token = newPlayerInstalacaoToken();
  await prisma.producaoPdvCadastro.update({
    where: { rioPdvKey },
    data: { playerInstalacaoToken: token, playerInstaladoEm: null },
  });
  return token;
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
