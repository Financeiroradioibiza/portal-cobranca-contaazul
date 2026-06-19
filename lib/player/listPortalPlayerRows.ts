import { prisma } from "@/lib/prisma";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import {
  buildPlayerIdMapFromBuckets,
  loadMergedProducaoPlayerContext,
} from "@/lib/player/producaoPlayerBuckets";
import { formatPortalPdvIdDisplay, proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import type { PortalPlayerIdBrief } from "@/lib/player/portalPlayerIds";

export type PortalPlayerRow = {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  clienteBucketKey: string;
  clienteNome: string;
  /** Linha Rio de origem do PDV (cobrança). */
  clienteLinhaId: string;
  rioLinhaNome: string;
  marcaNome: string | null;
  isLinhaProxy?: boolean;
  portalPlayerId: PortalPlayerIdBrief | null;
};

export async function listPortalPlayerRowsForMonth(ym: number): Promise<{
  yearMonth: number;
  rows: PortalPlayerRow[];
  stats: { total: number; linked: number; unlinked: number };
}> {
  const ctx = await loadMergedProducaoPlayerContext(ym);
  const linkMap = buildPlayerIdMapFromBuckets(ctx.buckets, ctx.pdvPortalIds);

  const linhaIds = [
    ...new Set(ctx.buckets.flatMap((b) => b.pdvs.map((p) => p.rioLinhaId)).filter(Boolean)),
  ];
  const linhaMeta = new Map<
    string,
    { marcaNome: string | null; documento: string | null; nome: string }
  >();
  if (linhaIds.length > 0) {
    const linhas = await prisma.rioCompClienteLinha.findMany({
      where: { id: { in: linhaIds } },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        documento: true,
        rioGrupo: { select: { nome: true } },
      },
    });
    for (const ln of linhas) {
      linhaMeta.set(ln.id, {
        marcaNome: ln.rioGrupo?.nome ?? null,
        documento: ln.documento,
        nome: ln.nomeFantasia || ln.razaoSocial || "Cliente",
      });
    }
  }

  const rows: PortalPlayerRow[] = [];

  for (const bucket of ctx.buckets) {
    const sorted = sortRioPdvsByNome(bucket.pdvs.map((p) => ({ id: p.rioPdvId, nome: p.nome })));
    const pdvList = sorted.map((s) => bucket.pdvs.find((p) => p.rioPdvId === s.id)!);

    for (const p of pdvList) {
      const meta = linhaMeta.get(p.rioLinhaId);
      rows.push({
        rioPdvId: p.rioPdvId,
        rioPdvNome: p.nome,
        rioDocumento: p.documento ?? meta?.documento ?? null,
        clienteBucketKey: bucket.key,
        clienteNome: bucket.nome,
        clienteLinhaId: p.rioLinhaId,
        rioLinhaNome: p.rioLinhaNome || meta?.nome || bucket.nome,
        marcaNome: meta?.marcaNome ?? null,
        isLinhaProxy: p.isLinhaProxy,
        portalPlayerId: linkMap.get(p.rioPdvId) ?? null,
      });
    }
  }

  rows.sort((a, b) => {
    const c = a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" });
    if (c !== 0) return c;
    return a.rioPdvNome.localeCompare(b.rioPdvNome, "pt-BR", { sensitivity: "base" });
  });

  const linked = rows.filter((r) => r.portalPlayerId).length;
  return {
    yearMonth: ym,
    rows,
    stats: { total: rows.length, linked, unlinked: rows.length - linked },
  };
}

/** Compatível com UI que ainda consome `/vinculos` (sem painel legado). */
export async function listVinculosForMonth(ym: number) {
  const payload = await listPortalPlayerRowsForMonth(ym);
  return {
    yearMonth: payload.yearMonth,
    stats: payload.stats,
    rows: payload.rows.map((r) => ({
      rioPdvId: r.rioPdvId,
      rioPdvNome: r.rioPdvNome,
      rioDocumento: r.rioDocumento,
      rioPdvMovimento: "estavel",
      clienteLinhaId: r.clienteLinhaId,
      clienteNome: r.clienteNome,
      clienteBucketKey: r.clienteBucketKey,
      rioLinhaNome: r.rioLinhaNome,
      marcaNome: r.marcaNome,
      isLinhaProxy: r.isLinhaProxy,
      link: r.portalPlayerId,
    })),
  };
}

export function parseCadastrosYearMonth(raw: string): number | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 200001 || n > 210012) return null;
  return Math.trunc(n);
}

export { formatPortalPdvIdDisplay, proxyPortalPdvId };
