import { prisma } from "@/lib/prisma";

/** Cache: tabela criacao_atualizacao_painel existe (migration 20260701120000). */
let painelTable: boolean | null = null;

export async function hasAtualizacaoPainelTable(): Promise<boolean> {
  if (painelTable !== null) return painelTable;
  try {
    await prisma.$queryRaw`SELECT id FROM criacao_atualizacao_painel LIMIT 0`;
    painelTable = true;
  } catch {
    painelTable = false;
  }
  return painelTable;
}
