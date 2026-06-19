import {
  buildCaByLinhaId,
  buildProducaoClientes,
  filterProducaoClientesVisiveis,
  isLinhaAsPdvKey,
  linhaAsPdvKey,
  mergeProducaoLayout,
  type ProducaoClienteBucket,
  type ProducaoLayoutState,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { getProducaoLayout } from "@/lib/cadastros/producaoLayoutService";
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
};

export type ProducaoPlayerBucket = ProducaoClienteBucket & {
  portalClienteId: number | null;
};

export type MergedProducaoPlayerContext = {
  yearMonth: number;
  buckets: ProducaoPlayerBucket[];
  layout: ProducaoLayoutWithPlayerIds;
  /** rioPdvKey → portalPdvId (PDVs reais; proxy usa proxyPortalPdvId). */
  pdvPortalIds: Map<string, number>;
  linhaPortalClienteIds: Map<string, number>;
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

function sortBucketsForAssign(buckets: ProducaoPlayerBucket[]): ProducaoPlayerBucket[] {
  return [...buckets].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
}

export async function getMaxPortalClienteId(
  layoutIds: Record<string, number>,
): Promise<number> {
  const [maxLinha, maxPdv] = await Promise.all([
    prisma.rioCompClienteLinha.aggregate({ _max: { portalClienteId: true } }),
    prisma.rioCompPdv.aggregate({ _max: { portalPdvId: true } }),
  ]);
  let max = PORTAL_CLIENTE_ID_START - 1;
  max = Math.max(max, maxLinha._max.portalClienteId ?? 0);
  if (maxPdv._max.portalPdvId != null) {
    max = Math.max(max, portalClienteIdFromPdvId(maxPdv._max.portalPdvId));
  }
  for (const id of Object.values(layoutIds)) max = Math.max(max, id);
  return max;
}

async function loadPdvPortalIdsForKeys(rioPdvKeys: string[]): Promise<Map<string, number>> {
  const realIds = rioPdvKeys.filter((k) => !isLinhaAsPdvKey(k));
  const map = new Map<string, number>();
  if (realIds.length === 0) return map;
  const pdvs = await prisma.rioCompPdv.findMany({
    where: { id: { in: realIds } },
    select: { id: true, portalPdvId: true },
  });
  for (const p of pdvs) {
    if (p.portalPdvId != null) map.set(p.id, p.portalPdvId);
  }
  return map;
}

async function loadLinhaPortalClienteIds(
  linhaIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (linhaIds.length === 0) return map;
  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: { id: { in: linhaIds } },
    select: { id: true, portalClienteId: true },
  });
  for (const ln of linhas) {
    if (ln.portalClienteId != null) map.set(ln.id, ln.portalClienteId);
  }
  return map;
}

function resolveBucketPortalClienteId(
  bucket: ProducaoClienteBucket,
  layoutIds: Record<string, number>,
  linhaPortalClienteIds: Map<string, number>,
): number | null {
  const fromLayout = layoutIds[bucket.key];
  if (fromLayout != null) return fromLayout;
  if (bucket.rioLinhaId && !bucket.isCustom) {
    return linhaPortalClienteIds.get(bucket.rioLinhaId) ?? null;
  }
  return null;
}

export function enrichBucketsWithPortalClienteIds(
  buckets: ProducaoClienteBucket[],
  layoutIds: Record<string, number>,
  linhaPortalClienteIds: Map<string, number>,
): ProducaoPlayerBucket[] {
  return buckets.map((b) => ({
    ...b,
    portalClienteId: resolveBucketPortalClienteId(b, layoutIds, linhaPortalClienteIds),
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
  yearMonth: number,
  opts?: { includeEmptyCustom?: boolean },
): Promise<MergedProducaoPlayerContext> {
  const [linhasForProd, rawLayout] = await Promise.all([
    loadRioLinhasForProducao(yearMonth),
    getProducaoLayout(yearMonth, { repairPlacements: true }),
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
  };

  const caByLinhaId = buildCaByLinhaId(linhasForProd);
  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(base, layout, { caByLinhaId });
  const visible = filterProducaoClientesVisiveis(merged, {
    keepEmptyCustom: opts?.includeEmptyCustom,
  }).filter((c) => c.pdvCount > 0 || (opts?.includeEmptyCustom && c.isCustom));

  const linhaIds = [...new Set(visible.map((b) => b.rioLinhaId).filter(Boolean))];
  const linhaPortalClienteIds = await loadLinhaPortalClienteIds(linhaIds);
  const buckets = enrichBucketsWithPortalClienteIds(
    visible.filter((c) => c.pdvCount > 0),
    layout.portalClienteIdsByBucketKey,
    linhaPortalClienteIds,
  );

  const pdvKeys = buckets.flatMap((b) => b.pdvs.map((p) => p.rioPdvId));
  const pdvPortalIds = await loadPdvPortalIdsForKeys(pdvKeys);

  return {
    yearMonth,
    buckets,
    layout,
    pdvPortalIds,
    linhaPortalClienteIds,
  };
}

export async function savePortalClienteIdsByBucketKey(
  yearMonth: number,
  portalClienteIdsByBucketKey: Record<string, number>,
): Promise<void> {
  await prisma.cadastroProducaoLayout.upsert({
    where: { yearMonth },
    create: { yearMonth, portalClienteIdsByBucketKey },
    update: { portalClienteIdsByBucketKey },
  });
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

/** Atribui portalClienteId por bucket da produção e portalPdvId por PDV (somente faltantes). */
export async function assignMissingProducaoPlayerIds(
  yearMonth: number,
): Promise<{ clientes: number; pdvs: number; portalClienteIdsByBucketKey: Record<string, number> }> {
  const ctx = await loadMergedProducaoPlayerContext(yearMonth);
  const layoutIds = { ...ctx.layout.portalClienteIdsByBucketKey };
  let nextClienteId = await getMaxPortalClienteId(layoutIds);
  let clientes = 0;
  let pdvs = 0;

  const pdvPortalIds = new Map(ctx.pdvPortalIds);

  for (const bucket of sortBucketsForAssign(ctx.buckets)) {
    let portalClienteId = bucket.portalClienteId;
    if (portalClienteId == null) {
      portalClienteId = ++nextClienteId;
      layoutIds[bucket.key] = portalClienteId;
      clientes++;
      if (bucket.rioLinhaId && !bucket.isCustom) {
        await prisma.rioCompClienteLinha.updateMany({
          where: { id: bucket.rioLinhaId, portalClienteId: null },
          data: { portalClienteId },
        });
      }
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
      await prisma.rioCompPdv.update({
        where: { id: p.id },
        data: { portalPdvId },
      });
      pdvPortalIds.set(p.id, portalPdvId);
      pdvs++;
    }
  }

  if (clientes > 0 || Object.keys(layoutIds).length > 0) {
    await savePortalClienteIdsByBucketKey(yearMonth, layoutIds);
  }

  return { clientes, pdvs, portalClienteIdsByBucketKey: layoutIds };
}

/** Renumera todos os IDs conforme buckets da produção (destrutivo — migração inicial). */
export async function renumberProducaoPlayerIds(
  yearMonth: number,
): Promise<{ clientes: number; pdvs: number }> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    select: { id: true },
  });
  if (!month) throw new Error("rio_month_not_found");

  const ctx = await loadMergedProducaoPlayerContext(yearMonth);
  const layoutIds: Record<string, number> = {};
  let nextClienteId = PORTAL_CLIENTE_ID_START - 1;
  let clientes = 0;
  let pdvs = 0;

  await prisma.$transaction(async (tx) => {
    await tx.rioCompPdv.updateMany({
      where: { cliente: { monthId: month.id } },
      data: { portalPdvId: null },
    });
    await tx.rioCompClienteLinha.updateMany({
      where: { monthId: month.id },
      data: { portalClienteId: null },
    });

    for (const bucket of sortBucketsForAssign(ctx.buckets)) {
      const portalClienteId = ++nextClienteId;
      layoutIds[bucket.key] = portalClienteId;
      clientes++;

      if (bucket.rioLinhaId && !bucket.isCustom) {
        await tx.rioCompClienteLinha.update({
          where: { id: bucket.rioLinhaId },
          data: { portalClienteId },
        });
      }

      let seq = 0;
      const sortedPdvs = sortRioPdvsByNome(
        bucket.pdvs
          .filter((p) => !p.isLinhaProxy)
          .map((p) => ({ id: p.rioPdvId, nome: p.nome })),
      );
      for (const p of sortedPdvs) {
        seq += 1;
        await tx.rioCompPdv.update({
          where: { id: p.id },
          data: { portalPdvId: buildPortalPdvId(portalClienteId, seq) },
        });
        pdvs++;
      }
    }
  });

  await savePortalClienteIdsByBucketKey(yearMonth, layoutIds);

  const validIds = Object.values(layoutIds);
  if (validIds.length > 0) {
    await prisma.clientePlayerLogin.deleteMany({
      where: { portalClienteId: { notIn: validIds } },
    });
    await prisma.playerClienteLogotipo.deleteMany({
      where: { portalClienteId: { notIn: validIds } },
    });
  }

  return { clientes, pdvs };
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
