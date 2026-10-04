import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";

/** Filtro «tags de um criativo» (e-mail ou nome parcial). */
export function tagCriativoOwnerPrisma(ownerKey: string): Prisma.TagCriativoWhereInput {
  const key = ownerKey.trim();
  if (!key) return {};
  if (key.includes("@")) {
    return { criativoUserId: { equals: key, mode: "insensitive" } };
  }
  return { criativoNome: { contains: key, mode: "insensitive" } };
}

export function tagCriativoOwnerSql(ownerKey: string): PrismaNs.Sql {
  const key = ownerKey.trim();
  if (!key) return PrismaNs.sql`TRUE`;
  if (key.includes("@")) {
    return PrismaNs.sql`LOWER(tc.criativo_user_id) = LOWER(${key})`;
  }
  const like = `%${key}%`;
  return PrismaNs.sql`tc.criativo_nome ILIKE ${like}`;
}

/** Ordem sugerida na UI (nomes parciais). */
export const BIBLIOTECA_TAG_OWNER_PREFERRED = [
  "Lauro",
  "Mary",
  "Rafael",
  "Renato",
  "FC",
  "Breno",
] as const;

export function sortTagOwnerLabels(a: string, b: string): number {
  const ia = BIBLIOTECA_TAG_OWNER_PREFERRED.findIndex(
    (p) => a.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(a.toLowerCase()),
  );
  const ib = BIBLIOTECA_TAG_OWNER_PREFERRED.findIndex(
    (p) => b.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(b.toLowerCase()),
  );
  const ra = ia >= 0 ? ia : 999;
  const rb = ib >= 0 ? ib : 999;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, "pt-BR");
}
