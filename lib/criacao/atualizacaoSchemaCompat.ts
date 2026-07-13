import { prisma } from "@/lib/prisma";

/** Cache: valor `off` em TipoSubidaAtualizacao (migration 20260713120000). */
let tipoSubidaOffReady: boolean | null = null;

export async function hasTipoSubidaOffEnum(): Promise<boolean> {
  if (tipoSubidaOffReady === true) return true;
  if (tipoSubidaOffReady === false) return false;
  try {
    await prisma.programacaoAtualizacao.findFirst({
      where: { tipoSubida: "off" },
      select: { id: true },
    });
    tipoSubidaOffReady = true;
    return true;
  } catch {
    tipoSubidaOffReady = false;
    return false;
  }
}

/**
 * Garante enum `off` quando deploy novo rodou mas migrate deploy falhou no Netlify.
 * SQL idempotente — mesma migration 20260713120000.
 */
export async function ensureTipoSubidaOffEnum(): Promise<boolean> {
  if (await hasTipoSubidaOffEnum()) return true;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "TipoSubidaAtualizacao" ADD VALUE IF NOT EXISTS 'off'`,
    );
    tipoSubidaOffReady = true;
    return true;
  } catch {
    tipoSubidaOffReady = false;
    return false;
  }
}
