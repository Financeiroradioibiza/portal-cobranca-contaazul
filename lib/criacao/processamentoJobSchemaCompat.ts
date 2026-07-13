import { prisma } from "@/lib/prisma";

/** Cache: coluna pasta_especial_id em processamento_job (migration 20260713140000). */
let pastaEspecialColumn: boolean | null = null;

export async function hasProcessamentoPastaEspecialColumn(): Promise<boolean> {
  if (pastaEspecialColumn !== null) return pastaEspecialColumn;
  try {
    await prisma.$queryRaw`SELECT pasta_especial_id FROM processamento_job LIMIT 0`;
    pastaEspecialColumn = true;
  } catch {
    pastaEspecialColumn = false;
  }
  return pastaEspecialColumn;
}

/**
 * Garante a coluna quando o código novo já foi deployado mas migrate deploy falhou no Netlify.
 * SQL idempotente (IF NOT EXISTS) — mesma migration 20260713140000.
 */
export async function ensureProcessamentoPastaEspecialColumn(): Promise<boolean> {
  if (await hasProcessamentoPastaEspecialColumn()) return true;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "processamento_job" ADD COLUMN IF NOT EXISTS "pasta_especial_id" TEXT`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "processamento_job_pasta_especial_id_idx" ON "processamento_job"("pasta_especial_id")`,
    );
    pastaEspecialColumn = true;
    return true;
  } catch {
    pastaEspecialColumn = false;
    return false;
  }
}
