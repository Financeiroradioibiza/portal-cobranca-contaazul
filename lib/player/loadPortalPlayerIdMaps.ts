import {
  buildPlayerIdMapFromBuckets,
  loadMergedProducaoPlayerContext,
} from "@/lib/player/producaoPlayerBuckets";
import {
  type PortalPlayerIdBrief,
} from "@/lib/player/portalPlayerIds";

export type PortalPlayerIdMaps = {
  byRioPdvKey: Map<string, PortalPlayerIdBrief>;
  clienteIdByBucketKey: Map<string, number>;
};

/** Carrega IDs do Player conforme organização da produção musical. */
export async function loadPortalPlayerIdMaps(
  yearMonth: number,
  rioPdvKeys: string[],
): Promise<PortalPlayerIdMaps> {
  const ctx = await loadMergedProducaoPlayerContext(yearMonth);
  const byRioPdvKey = buildPlayerIdMapFromBuckets(ctx.buckets, ctx.pdvPortalIds);

  const clienteIdByBucketKey = new Map<string, number>();
  for (const b of ctx.buckets) {
    if (b.portalClienteId != null) clienteIdByBucketKey.set(b.key, b.portalClienteId);
  }

  if (rioPdvKeys.length === 0) {
    return { byRioPdvKey, clienteIdByBucketKey };
  }

  const wanted = new Set(rioPdvKeys);
  const filtered = new Map<string, PortalPlayerIdBrief>();
  for (const [k, v] of byRioPdvKey) {
    if (wanted.has(k)) filtered.set(k, v);
  }
  return { byRioPdvKey: filtered, clienteIdByBucketKey };
}
