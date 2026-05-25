import type { RioPlanilhaBand, RioPlanilhaRow } from "@prisma/client";

const BAND_RANK: Record<RioPlanilhaBand, number> = {
  canceladas: 0,
  novos: 1,
  ativos: 2,
};

/** Igual ao Excel: primeiro canceladas, PDVs novos, depois clientes ativos — e por `sortOrder`. */
export function sortRioPlanilhaRows(rows: RioPlanilhaRow[]): RioPlanilhaRow[] {
  return [...rows].sort((a, b) => {
    const bd = BAND_RANK[a.band] - BAND_RANK[b.band];
    if (bd !== 0) return bd;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });
}
