import {
  PRODUCAO_CATALOGO_LAYOUT_YM,
  getProducaoRioSourceYm,
} from "@/lib/cadastros/producaoCatalogo";
import {
  buildCaByLinhaId,
  buildProducaoClientes,
  filterProducaoClientesVisiveis,
  mergeProducaoLayout,
  type ProducaoClienteBucket,
  type ProducaoLayoutState,
} from "@/lib/cadastros/producaoHierarchy";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { loadRioLinhasForProducao } from "@/lib/cadastros/producaoMovimento";
import { prisma } from "@/lib/prisma";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import {
  buildPortalPdvId,
  PORTAL_CLIENTE_ID_START,
  portalClienteIdFromPdvId,
  portalPdvSeqFromPdvId,
  proxyPortalPdvId,
  type PortalPlayerIdBrief,
} from "@/lib/player/portalPlayerIds";

export type ProducaoLayoutWithPlayerIds = ProducaoLayoutState & {
  portalClienteIdsByBucketKey: Record<string, number>;
  portalPdvIdsByRioPdvKey: Record<string, number>;
};

export type ProducaoPlayerBucket = ProducaoClienteBucket & {
  portalClienteId: number | null;
};

export type MergedProducaoPlayerContext = {
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  buckets: ProducaoPlayerBucket[];
  layout: ProducaoLayoutWithPlayerIds;
  /** rioPdvKey → portalPdvId (catálogo operacional; proxy usa proxyPortalPdvId). */
  pdvPortalIds: Map<string, number>;
};

function asBucketClienteIds(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = typeof val === "number" ? val : Number(val);
    if (k.trim() && Number.isFinite(n) && n > 0) out[k] = Math.trunc(n);
  }
  return out;
}

function asPdvIdsByKey(v: unknown): Record<string, number> {
  return asBucketClienteIds(v);
}

function sortBucketsForAssign(buckets: ProducaoPlayerBucket[]): ProducaoPlayerBucket[] {
  return [...buckets].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
}

export async function getMaxPortalClienteId(
  layoutIds: Record<string, number>,
  pdvIdsByKey: Record<string, number>,
): Promise<number> {
  const maxLogin = await prisma.clientePlayerLogin.aggregate({
    _max: { portalClienteId: true },
  });
  let max = PORTAL_CLIENTE_ID_START - 1;
  max = Math.max(max, maxLogin._max.portalClienteId ?? 0);
  for (const id of Object.values(layoutIds)) max = Math.max(max, id);
  for (const id of Object.values(pdvIdsByKey)) {
    max = Math.max(max, portalClienteIdFromPdvId(id));
  }
  return max;
}

function pdvPortalIdsFromLayout(layoutIds: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, id] of Object.entries(layoutIds)) {
    if (key.trim() && Number.isFinite(id)) map.set(key, Math.trunc(id));
  }
  return map;
}

function resolveBucketPortalClienteId(
  bucket: ProducaoClienteBucket,
  layoutIds: Record<string, number>,
): number | null {
  const fromLayout = layoutIds[bucket.key];
  return fromLayout != null ? fromLayout : null;
}

export function enrichBucketsWithPortalClienteIds(
  buckets: ProducaoClienteBucket[],
  layoutIds: Record<string, number>,
): ProducaoPlayerBucket[] {
  return buckets.map((b) => ({
    ...b,
    portalClienteId: resolveBucketPortalClienteId(b, layoutIds),
  }));
}

export function buildPlayerIdMapFromBuckets(
  buckets: ProducaoPlayerBucket[],
  pdvPortalIds: Map<string, number>,
): Map<string, PortalPlayerIdBrief> {
  const map = new Map<string, PortalPlayerIdBrief>();
  for (const bucket of buckets) {
    if (bucket.portalClienteId == null) continue;
    for (const p of bucket.pdvs) {
      if (p.isLinhaProxy) {
        map.set(p.rioPdvId, {
          portalClienteId: bucket.portalClienteId,
          portalPdvId: proxyPortalPdvId(bucket.portalClienteId),
        });
        continue;
      }
      const portalPdvId = pdvPortalIds.get(p.rioPdvId);
      if (portalPdvId != null) {
        map.set(p.rioPdvId, {
          portalClienteId: bucket.portalClienteId,
          portalPdvId,
        });
      }
    }
  }
  return map;
}

/** Buckets da produção musical com PDV (organização editorial), prontos para IDs Player. */
export async function loadMergedProducaoPlayerContext(
  opts?: { includeEmptyCustom?: boolean },
): Promise<MergedProducaoPlayerContext> {
  const rioSourceYearMonth = await getProducaoRioSourceYm();
  const [linhasForProd, rawLayout] = await Promise.all([
    loadRioLinhasForProducao(rioSourceYearMonth),
    getProducaoCatalogLayout({ repairPlacements: true }),
  ]);

  const layout: ProducaoLayoutWithPlayerIds = {
    clienteNomes: rawLayout.clienteNomes,
    pdvPlacements: rawLayout.pdvPlacements,
    hiddenClienteKeys: rawLayout.hiddenClienteKeys,
    customClientes: rawLayout.customClientes,
    acknowledgedPdvs: rawLayout.acknowledgedPdvs,
    movimentoBaselineEntradaIds: rawLayout.movimentoBaselineEntradaIds,
    movimentoBaselineSaidaIds: rawLayout.movimentoBaselineSaidaIds,
    portalClienteIdsByBucketKey: asBucketClienteIds(rawLayout.portalClienteIdsByBucketKey),
    portalPdvIdsByRioPdvKey: asPdvIdsByKey(rawLayout.portalPdvIdsByRioPdvKey),
  };

  const caByLinhaId = buildCaByLinhaId(linhasForProd);
  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(base, layout, { caByLinhaId });
  const visible = filterProducaoClientesVisiveis(merged, {
    keepEmptyCustom: opts?.includeEmptyCustom,
  }).filter((c) => c.pdvCount > 0 || (opts?.includeEmptyCustom && c.isCustom));

  const buckets = enrichBucketsWithPortalClienteIds(
    visible.filter((c) => c.pdvCount > 0),
    layout.portalClienteIdsByBucketKey,
  );

  const pdvPortalIds = pdvPortalIdsFromLayout(layout.portalPdvIdsByRioPdvKey);

  return {
    layoutYearMonth: PRODUCAO_CATALOGO_LAYOUT_YM,
    rioSourceYearMonth,
    buckets,
    layout,
    pdvPortalIds,
  };
}

async function savePlayerIdsOnCatalogLayout(patch: {
  portalClienteIdsByBucketKey?: Record<string, number>;
  portalPdvIdsByRioPdvKey?: Record<string, number>;
}): Promise<void> {
  await prisma.cadastroProducaoLayout.upsert({
    where: { yearMonth: PRODUCAO_CATALOGO_LAYOUT_YM },
    create: {
      yearMonth: PRODUCAO_CATALOGO_LAYOUT_YM,
      ...patch,
    },
    update: patch,
  });
}

export async function savePortalClienteIdsByBucketKey(
  portalClienteIdsByBucketKey: Record<string, number>,
): Promise<void> {
  await savePlayerIdsOnCatalogLayout({ portalClienteIdsByBucketKey });
}

function maxSeqForBucket(
  bucket: ProducaoPlayerBucket,
  portalClienteId: number,
  pdvPortalIds: Map<string, number>,
): number {
  let max = 0;
  for (const p of bucket.pdvs) {
    if (p.isLinhaProxy) continue;
    const existing = pdvPortalIds.get(p.rioPdvId);
    if (existing == null) continue;
    if (portalClienteIdFromPdvId(existing) === portalClienteId) {
      max = Math.max(max, portalPdvSeqFromPdvId(existing));
    }
  }
  return max;
}

export const PLAYER_ID_REALIGN_BATCH_SIZE = 10;

export type PlayerIdRealignWorkItem =
  | { kind: "bucket"; bucketKey: string; portalClienteId: number }
  | { kind: "pdv"; rioPdvKey: string; portalPdvId: number };

export type PlayerIdRealignPlan = {
  layoutIds: Record<string, number>;
  pdvIds: Record<string, number>;
  work: PlayerIdRealignWorkItem[];
  clientes: number;
  pdvs: number;
};

function buildProducaoPlayerRealignPlanFromBuckets(
  buckets: ProducaoPlayerBucket[],
): PlayerIdRealignPlan {
  const layoutIds: Record<string, number> = {};
  const pdvIds: Record<string, number> = {};
  const work: PlayerIdRealignWorkItem[] = [];
  let nextClienteId = PORTAL_CLIENTE_ID_START - 1;
  let clientes = 0;
  let pdvs = 0;

  for (const bucket of sortBucketsForAssign(buckets)) {
    const portalClienteId = ++nextClienteId;
    layoutIds[bucket.key] = portalClienteId;
    work.push({ kind: "bucket", bucketKey: bucket.key, portalClienteId });
    clientes++;

    let seq = 0;
    const sortedPdvs = sortRioPdvsByNome(
      bucket.pdvs
        .filter((p) => !p.isLinhaProxy)
        .map((p) => ({ id: p.rioPdvId, nome: p.nome })),
    );
    for (const p of sortedPdvs) {
      seq += 1;
      const portalPdvId = buildPortalPdvId(portalClienteId, seq);
      pdvIds[p.id] = portalPdvId;
      work.push({ kind: "pdv", rioPdvKey: p.id, portalPdvId });
      pdvs++;
    }
  }

  return { layoutIds, pdvIds, work, clientes, pdvs };
}

export async function buildProducaoPlayerRealignPlan(): Promise<PlayerIdRealignPlan> {
  const ctx = await loadMergedProducaoPlayerContext();
  return buildProducaoPlayerRealignPlanFromBuckets(ctx.buckets);
}

/** Zera IDs Player no catálogo operacional — não altera a Planilha Rio. */
export async function resetProducaoPlayerIdsOnCatalog(): Promise<void> {
  await savePlayerIdsOnCatalogLayout({
    portalClienteIdsByBucketKey: {},
    portalPdvIdsByRioPdvKey: {},
  });
}

async function applyPlayerIdWorkItems(
  items: PlayerIdRealignWorkItem[],
  baseLayoutIds: Record<string, number>,
  basePdvIds: Record<string, number>,
): Promise<number> {
  const layoutIds = { ...baseLayoutIds };
  const pdvIds = { ...basePdvIds };
  let applied = 0;
  for (const item of items) {
    if (item.kind === "bucket") {
      layoutIds[item.bucketKey] = item.portalClienteId;
    } else {
      pdvIds[item.rioPdvKey] = item.portalPdvId;
    }
    applied++;
  }
  if (applied > 0) {
    await savePlayerIdsOnCatalogLayout({
      portalClienteIdsByBucketKey: layoutIds,
      portalPdvIdsByRioPdvKey: pdvIds,
    });
  }
  return applied;
}

export async function applyProducaoPlayerRealignBatch(
  offset: number,
  limit = PLAYER_ID_REALIGN_BATCH_SIZE,
  opts?: { reset?: boolean },
): Promise<{
  applied: number;
  nextOffset: number;
  hasMore: boolean;
  total: number;
  clientes: number;
  pdvs: number;
}> {
  if (opts?.reset) {
    await resetProducaoPlayerIdsOnCatalog();
  }

  const plan = await buildProducaoPlayerRealignPlan();
  const ctx = await loadMergedProducaoPlayerContext();
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.min(25, Math.max(1, Math.floor(limit) || PLAYER_ID_REALIGN_BATCH_SIZE));
  const slice = plan.work.slice(off, off + lim);
  const applied = await applyPlayerIdWorkItems(
    slice,
    ctx.layout.portalClienteIdsByBucketKey,
    ctx.layout.portalPdvIdsByRioPdvKey,
  );
  const nextOffset = off + applied;
  return {
    applied,
    nextOffset,
    hasMore: nextOffset < plan.work.length,
    total: plan.work.length,
    clientes: plan.clientes,
    pdvs: plan.pdvs,
  };
}

export async function finalizeProducaoPlayerRealign(): Promise<{
  clientes: number;
  pdvs: number;
  layoutIds: Record<string, number>;
}> {
  const plan = await buildProducaoPlayerRealignPlan();
  await savePortalClienteIdsByBucketKey(plan.layoutIds);
  await savePlayerIdsOnCatalogLayout({ portalPdvIdsByRioPdvKey: plan.pdvIds });

  const validIds = Object.values(plan.layoutIds);
  if (validIds.length > 0) {
    await prisma.clientePlayerLogin.deleteMany({
      where: { portalClienteId: { notIn: validIds } },
    });
    await prisma.playerClienteLogotipo.deleteMany({
      where: { portalClienteId: { notIn: validIds } },
    });
  }

  return { clientes: plan.clientes, pdvs: plan.pdvs, layoutIds: plan.layoutIds };
}

export type PlayerIdMissingWorkItem = PlayerIdRealignWorkItem;

export async function buildProducaoPlayerMissingPlan(): Promise<PlayerIdRealignPlan> {
  const ctx = await loadMergedProducaoPlayerContext();
  const layoutIds = { ...ctx.layout.portalClienteIdsByBucketKey };
  const pdvIds = { ...ctx.layout.portalPdvIdsByRioPdvKey };
  let nextClienteId = await getMaxPortalClienteId(layoutIds, pdvIds);
  const work: PlayerIdMissingWorkItem[] = [];
  let clientes = 0;
  let pdvs = 0;
  const pdvPortalIds = pdvPortalIdsFromLayout(pdvIds);

  for (const bucket of sortBucketsForAssign(ctx.buckets)) {
    let portalClienteId = bucket.portalClienteId;
    if (portalClienteId == null) {
      portalClienteId = ++nextClienteId;
      layoutIds[bucket.key] = portalClienteId;
      work.push({ kind: "bucket", bucketKey: bucket.key, portalClienteId });
      clientes++;
    }

    let seq = maxSeqForBucket({ ...bucket, portalClienteId }, portalClienteId, pdvPortalIds);
    const sortedPdvs = sortRioPdvsByNome(
      bucket.pdvs
        .filter((p) => !p.isLinhaProxy)
        .map((p) => ({ id: p.rioPdvId, nome: p.nome })),
    );

    for (const p of sortedPdvs) {
      if (pdvPortalIds.has(p.id)) continue;
      seq += 1;
      const portalPdvId = buildPortalPdvId(portalClienteId, seq);
      work.push({ kind: "pdv", rioPdvKey: p.id, portalPdvId });
      pdvIds[p.id] = portalPdvId;
      pdvPortalIds.set(p.id, portalPdvId);
      pdvs++;
    }
  }

  return { layoutIds, pdvIds, work, clientes, pdvs };
}

export async function applyProducaoPlayerMissingBatch(
  offset: number,
  limit = PLAYER_ID_REALIGN_BATCH_SIZE,
): Promise<{
  applied: number;
  nextOffset: number;
  hasMore: boolean;
  total: number;
  clientes: number;
  pdvs: number;
  layoutIds: Record<string, number>;
  pdvIds: Record<string, number>;
}> {
  const plan = await buildProducaoPlayerMissingPlan();
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.min(25, Math.max(1, Math.floor(limit) || PLAYER_ID_REALIGN_BATCH_SIZE));
  const slice = plan.work.slice(off, off + lim);
  const ctx = await loadMergedProducaoPlayerContext();
  const applied = await applyPlayerIdWorkItems(
    slice,
    ctx.layout.portalClienteIdsByBucketKey,
    ctx.layout.portalPdvIdsByRioPdvKey,
  );
  const nextOffset = off + applied;

  return {
    applied,
    nextOffset,
    hasMore: nextOffset < plan.work.length,
    total: plan.work.length,
    clientes: plan.clientes,
    pdvs: plan.pdvs,
    layoutIds: plan.layoutIds,
    pdvIds: plan.pdvIds,
  };
}

export async function finalizeProducaoPlayerMissing(
  layoutIds: Record<string, number>,
  pdvIds: Record<string, number>,
): Promise<void> {
  const patch: {
    portalClienteIdsByBucketKey?: Record<string, number>;
    portalPdvIdsByRioPdvKey?: Record<string, number>;
  } = {};
  if (Object.keys(layoutIds).length > 0) patch.portalClienteIdsByBucketKey = layoutIds;
  if (Object.keys(pdvIds).length > 0) patch.portalPdvIdsByRioPdvKey = pdvIds;
  if (Object.keys(patch).length > 0) await savePlayerIdsOnCatalogLayout(patch);
}

/** Programação publicada em Criação → nome do programa no gateway (por bucket ou cliente gateway). */
export async function loadProgramacaoMusicalMaps(): Promise<{
  byPortalClienteId: Map<number, string>;
  byClienteRef: Map<string, string>;
}> {
  const rows = await prisma.programacao.findMany({
    where: { publicada: true },
    select: { clienteRef: true, clienteGatewayId: true, nome: true, publishedAt: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });
  const byPortalClienteId = new Map<number, string>();
  const byClienteRef = new Map<string, string>();
  for (const r of rows) {
    const nome = r.nome.trim() || "Padrão";
    const ref = r.clienteRef.trim();
    if (ref && !byClienteRef.has(ref)) byClienteRef.set(ref, nome);
    if (r.clienteGatewayId != null && !byPortalClienteId.has(r.clienteGatewayId)) {
      byPortalClienteId.set(r.clienteGatewayId, nome);
    }
  }
  return { byPortalClienteId, byClienteRef };
}

export function resolveProgramacaoMusicalForBucket(
  bucket: ProducaoPlayerBucket,
  maps: { byPortalClienteId: Map<number, string>; byClienteRef: Map<string, string> },
): string {
  if (bucket.portalClienteId != null) {
    const byGw = maps.byPortalClienteId.get(bucket.portalClienteId);
    if (byGw) return byGw;
  }
  const byRef = maps.byClienteRef.get(bucket.key);
  if (byRef) return byRef;
  if (bucket.rioLinhaId) {
    const byLinha = maps.byClienteRef.get(bucket.rioLinhaId);
    if (byLinha) return byLinha;
  }
  return "Padrão";
}

/** @deprecated use resetProducaoPlayerIdsOnCatalog */
export async function resetProducaoPlayerIdsForMonth(_yearMonth: number): Promise<void> {
  await resetProducaoPlayerIdsOnCatalog();
}
