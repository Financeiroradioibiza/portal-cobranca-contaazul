import { prisma } from "@/lib/prisma";
import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { proxyPortalPdvId, type PortalPlayerIdBrief } from "@/lib/player/portalPlayerIds";

export type PortalPlayerRow = {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  clienteLinhaId: string;
  clienteNome: string;
  marcaNome: string | null;
  isLinhaProxy?: boolean;
  portalPlayerId: PortalPlayerIdBrief | null;
};

export async function listPortalPlayerRowsForMonth(ym: number): Promise<{
  yearMonth: number;
  rows: PortalPlayerRow[];
  stats: { total: number; linked: number; unlinked: number };
}> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          rioGrupo: { select: { nome: true } },
          pdvs: { orderBy: [{ sortOrder: "asc" }] },
        },
      },
    },
  });

  if (!month) {
    return { yearMonth: ym, rows: [], stats: { total: 0, linked: 0, unlinked: 0 } };
  }

  const rows: PortalPlayerRow[] = [];
  for (const linha of month.linhas) {
    if (linha.movimento === "saida") continue;
    const clienteNome = linha.nomeFantasia || linha.razaoSocial;
    const activePdvs = linha.pdvs.filter((p) => p.movimento !== "saida");

    if (activePdvs.length === 0) {
      rows.push({
        rioPdvId: linhaAsPdvKey(linha.id),
        rioPdvNome: clienteNome,
        rioDocumento: linha.documento,
        clienteLinhaId: linha.id,
        clienteNome,
        marcaNome: linha.rioGrupo?.nome ?? null,
        isLinhaProxy: true,
        portalPlayerId:
          linha.portalClienteId != null ?
            {
              portalClienteId: linha.portalClienteId,
              portalPdvId: proxyPortalPdvId(linha.portalClienteId),
            }
          : null,
      });
      continue;
    }

    for (const pdv of activePdvs) {
      rows.push({
        rioPdvId: pdv.id,
        rioPdvNome: pdv.nome,
        rioDocumento: pdv.documento,
        clienteLinhaId: linha.id,
        clienteNome,
        marcaNome: linha.rioGrupo?.nome ?? null,
        portalPlayerId:
          linha.portalClienteId != null && pdv.portalPdvId != null ?
            { portalClienteId: linha.portalClienteId, portalPdvId: pdv.portalPdvId }
          : null,
      });
    }
  }

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
