import { prisma } from "@/lib/prisma";

/** Cache: colunas de ciclo aberto existem no banco (migration 20260629130000). */
let atualizacaoAbertaColumn: boolean | null = null;

export async function hasAtualizacaoAbertaColumn(): Promise<boolean> {
  if (atualizacaoAbertaColumn !== null) return atualizacaoAbertaColumn;
  try {
    await prisma.$queryRaw`SELECT atualizacao_aberta_em FROM programacao LIMIT 0`;
    atualizacaoAbertaColumn = true;
  } catch {
    atualizacaoAbertaColumn = false;
  }
  return atualizacaoAbertaColumn;
}
