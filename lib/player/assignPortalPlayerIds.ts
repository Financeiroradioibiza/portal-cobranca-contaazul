import { getProducaoCatalogMeta } from "@/lib/cadastros/producaoCatalogo";
import {
  applyProducaoPlayerMissingBatch,
  applyProducaoPlayerRealignBatch,
  finalizeProducaoPlayerMissing,
  finalizeProducaoPlayerRealign,
  PLAYER_ID_REALIGN_BATCH_SIZE,
} from "@/lib/player/producaoPlayerBuckets";

export type AssignPortalPlayerIdsResult = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  clientes: number;
  pdvs: number;
};

export type AssignPortalPlayerIdsBatchResult = AssignPortalPlayerIdsResult & {
  applied: number;
  nextOffset: number;
  hasMore: boolean;
  total: number;
  phase: "reset" | "apply" | "done";
};

async function resolveCatalogMeta(): Promise<{
  layoutYearMonth: number;
  rioSourceYearMonth: number;
}> {
  return getProducaoCatalogMeta();
}

/** Realinha IDs em lotes (evita timeout Netlify/Neon). Só grava no catálogo operacional. */
export async function realignPortalPlayerIdsBatch(opts: {
  offset?: number;
  limit?: number;
  reset?: boolean;
}): Promise<AssignPortalPlayerIdsBatchResult> {
  const meta = await resolveCatalogMeta();
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = opts.limit ?? PLAYER_ID_REALIGN_BATCH_SIZE;

  const batch = await applyProducaoPlayerRealignBatch(offset, limit, {
    reset: opts.reset === true || offset === 0,
  });
  if (!batch.hasMore) {
    const fin = await finalizeProducaoPlayerRealign();
    return {
      ...meta,
      clientes: fin.clientes,
      pdvs: fin.pdvs,
      applied: batch.applied,
      nextOffset: batch.nextOffset,
      hasMore: false,
      total: batch.total,
      phase: "done",
    };
  }

  return {
    ...meta,
    clientes: batch.clientes,
    pdvs: batch.pdvs,
    applied: batch.applied,
    nextOffset: batch.nextOffset,
    hasMore: true,
    total: batch.total,
    phase: "apply",
  };
}

/** Só faltantes — também em lotes. */
export async function assignMissingPortalPlayerIdsBatch(opts: {
  offset?: number;
  limit?: number;
}): Promise<AssignPortalPlayerIdsBatchResult & { layoutIds: Record<string, number> }> {
  const meta = await resolveCatalogMeta();
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = opts.limit ?? PLAYER_ID_REALIGN_BATCH_SIZE;
  const batch = await applyProducaoPlayerMissingBatch(offset, limit);

  if (!batch.hasMore) {
    await finalizeProducaoPlayerMissing(batch.layoutIds, batch.pdvIds);
    return {
      ...meta,
      clientes: batch.clientes,
      pdvs: batch.pdvs,
      applied: batch.applied,
      nextOffset: batch.nextOffset,
      hasMore: false,
      total: batch.total,
      phase: "done",
      layoutIds: batch.layoutIds,
    };
  }

  return {
    ...meta,
    clientes: batch.clientes,
    pdvs: batch.pdvs,
    applied: batch.applied,
    nextOffset: batch.nextOffset,
    hasMore: true,
    total: batch.total,
    phase: "apply",
    layoutIds: batch.layoutIds,
  };
}

/** Loop servidor — uso raro; preferir batch pela API/UI. */
export async function realignPortalPlayerIds(): Promise<AssignPortalPlayerIdsResult> {
  let offset = 0;
  let result: AssignPortalPlayerIdsBatchResult | null = null;
  do {
    result = await realignPortalPlayerIdsBatch({
      offset,
      reset: offset === 0,
    });
    offset = result.nextOffset;
  } while (result.hasMore);
  return {
    layoutYearMonth: result!.layoutYearMonth,
    rioSourceYearMonth: result!.rioSourceYearMonth,
    clientes: result!.clientes,
    pdvs: result!.pdvs,
  };
}

export async function assignMissingPortalPlayerIds(): Promise<AssignPortalPlayerIdsResult> {
  let offset = 0;
  let result: (AssignPortalPlayerIdsBatchResult & { layoutIds: Record<string, number> }) | null =
    null;
  do {
    result = await assignMissingPortalPlayerIdsBatch({ offset });
    offset = result.nextOffset;
  } while (result.hasMore);
  return {
    layoutYearMonth: result!.layoutYearMonth,
    rioSourceYearMonth: result!.rioSourceYearMonth,
    clientes: result!.clientes,
    pdvs: result!.pdvs,
  };
}

/** @deprecated alias */
export const assignPortalPlayerIds = realignPortalPlayerIds;
