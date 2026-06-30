import { prisma } from "@/lib/prisma";

let iaParamsColumns: boolean | null = null;

/** Colunas ia_bed_volume / ia_voice_speed / ia_voice_stability (migration 20260703160000). */
export async function hasVinhetaIaParamsColumns(): Promise<boolean> {
  if (iaParamsColumns !== null) return iaParamsColumns;
  try {
    await prisma.$queryRaw`SELECT ia_bed_volume FROM vinheta LIMIT 0`;
    iaParamsColumns = true;
  } catch {
    iaParamsColumns = false;
  }
  return iaParamsColumns;
}
