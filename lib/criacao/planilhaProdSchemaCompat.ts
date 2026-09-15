import { prisma } from "@/lib/prisma";

let cached: boolean | null = null;

export async function hasPlanilhaProdTable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const rows = await prisma.$queryRaw<{ reg: string | null }[]>`
      SELECT to_regclass('public.planilha_prod_month') AS reg
    `;
    cached = Boolean(rows[0]?.reg);
  } catch {
    cached = false;
  }
  return cached;
}
