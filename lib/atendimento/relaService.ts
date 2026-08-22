import {
  PRODUCAO_CATALOGO_LAYOUT_YM,
  getProducaoRioSourceYm,
} from "@/lib/cadastros/producaoCatalogo";
import {
  buildCaByLinhaId,
  buildProducaoClientes,
  filterProducaoClientesVisiveis,
  mergeProducaoLayout,
  type ProducaoLayoutState,
} from "@/lib/cadastros/producaoHierarchy";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { loadRioLinhasForProducao } from "@/lib/cadastros/producaoMovimento";
import { prisma } from "@/lib/prisma";
import { listVinculosForMonth } from "@/lib/player/listPortalPlayerRows";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { getRioCompMonthWithLinhas, type RioCompGrupoDto } from "@/lib/rio/rioClienteCompService";
import type { RioCompLinhaEnriched } from "@/lib/rio/enrichRioLinhasPrimeiroPing";
import {
  compareRioLinhasByNomeFantasia,
  sortRioCompGruposForDisplay,
} from "@/lib/rio/sortRioCompLinhas";
import {
  effectiveRioTagCobranca,
  type RioTagCobranca,
} from "@/lib/rio/rioTagCobranca";
import { formatRioValorTotal, sumRioLinhasTotals } from "@/lib/rio/rioPlanilhaTotals";
import { valorClienteTextoFromPdvUnit } from "@/lib/rio/valorClienteCalc";

export type RelaFinanceiroPdvRow = {
  id: string;
  nome: string;
  documento: string | null;
  primeiroPingEm: string | null;
  tagCobranca: RioTagCobranca;
};

export type RelaFinanceiroClienteRow = {
  id: string;
  cliente: string;
  cnpj: string;
  valor: string;
  nPdvs: number;
  emailCobranca: string;
  primeiroPingEm: string | null;
  tagCobranca: RioTagCobranca;
  temPdvs: boolean;
  pdvs: RelaFinanceiroPdvRow[];
};

export type RelaFinanceiroMarcaBlock = {
  id: string;
  nome: string;
  clienteCount: number;
  pdvTotal: number;
  valorTotalLabel: string;
  clientes: RelaFinanceiroClienteRow[];
};

export type RelaProducaoPdvRow = {
  rioPdvKey: string;
  nome: string;
  documento: string | null;
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  portalPdvId: number | null;
  portalPdvLabel: string | null;
  isLinhaProxy: boolean;
};

export type RelaProducaoClienteRow = {
  key: string;
  nome: string;
  rioLinhaId: string;
  documento: string | null;
  pdvCount: number;
  pdvs: RelaProducaoPdvRow[];
};

export type AtendimentoRelaPayload = {
  ok: true;
  yearMonth: number;
  geradoEm: string;
  financeiro: RelaFinanceiroMarcaBlock[];
  producao: RelaProducaoClienteRow[];
};

function linhaValorDisplay(l: {
  valorClienteTexto?: string | null;
  valorPdvUnitarioTexto?: string | null;
  numeroPdvSite?: number | null;
}): string {
  const t = l.valorClienteTexto?.trim();
  if (t) return t;
  const fromUnit = valorClienteTextoFromPdvUnit(
    l.valorPdvUnitarioTexto ?? "",
    l.numeroPdvSite ?? 0,
  );
  return fromUnit || "—";
}

function formatDoc(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "—";
}

function formatEmail(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "—";
}

function formatCampo(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "—";
}

function activePdvs<T extends { movimento?: string | null }>(pdvs: T[]): T[] {
  return pdvs.filter((p) => (p.movimento ?? "estavel") !== "saida");
}

function earliestIso(dates: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  for (const d of dates) {
    if (!d?.trim()) continue;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) continue;
    if (best == null || t < best) best = t;
  }
  return best != null ? new Date(best).toISOString() : null;
}

function mapFinanceiroLinha(ln: RioCompLinhaEnriched): RelaFinanceiroClienteRow {
  const linhaTag = ln.tagCobranca ?? "cobrando";
  const pdvsVisiveis = activePdvs(ln.pdvs);
  const pdvs: RelaFinanceiroPdvRow[] = pdvsVisiveis.map((p) => ({
    id: p.id,
    nome: p.nome,
    documento: p.documento,
    primeiroPingEm: (p as { primeiroPingEm?: string | null }).primeiroPingEm ?? null,
    tagCobranca: effectiveRioTagCobranca(p.tagCobranca, linhaTag),
  }));

  const primeiroPingEm =
    pdvs.length > 0 ?
      earliestIso(pdvs.map((p) => p.primeiroPingEm))
    : (ln.primeiroPingEm ?? null);

  const nPdvs =
    (ln.numeroPdvSite ?? 0) > 0 ? ln.numeroPdvSite! : pdvs.length > 0 ? pdvs.length : 1;

  return {
    id: ln.id,
    cliente: ln.nomeFantasia?.trim() || ln.razaoSocial?.trim() || "—",
    cnpj: formatDoc(ln.documento),
    valor: linhaValorDisplay(ln),
    nPdvs,
    emailCobranca: formatEmail(ln.emailCobranca),
    primeiroPingEm,
    tagCobranca: linhaTag,
    temPdvs: pdvs.length > 0,
    pdvs,
  };
}

function buildFinanceiroBlocks(
  grupos: RioCompGrupoDto[],
  linhas: RioCompLinhaEnriched[],
): RelaFinanceiroMarcaBlock[] {
  const gruposOrd = sortRioCompGruposForDisplay(grupos.filter((g) => !g.systemTag));
  const nomeByGrupoId = new Map(gruposOrd.map((g) => [g.id, g.nome]));
  const byGrupo = new Map<string, RioCompLinhaEnriched[]>();
  const orphans: RioCompLinhaEnriched[] = [];

  for (const ln of linhas) {
    if (ln.movimento === "saida") continue;
    const gid = ln.rioGrupoId;
    if (gid && nomeByGrupoId.has(gid)) {
      const arr = byGrupo.get(gid) ?? [];
      arr.push(ln);
      byGrupo.set(gid, arr);
    } else {
      orphans.push(ln);
    }
  }

  const blocks: RelaFinanceiroMarcaBlock[] = [];

  for (const g of gruposOrd) {
    const raw = (byGrupo.get(g.id) ?? []).sort(compareRioLinhasByNomeFantasia);
    if (raw.length === 0) continue;
    const totals = sumRioLinhasTotals(raw);
    blocks.push({
      id: g.id,
      nome: g.nome,
      clienteCount: raw.length,
      pdvTotal: totals.pdvTotal,
      valorTotalLabel: formatRioValorTotal(totals.valorHasAny, totals.valorTotal),
      clientes: raw.map(mapFinanceiroLinha),
    });
  }

  if (orphans.length > 0) {
    const sorted = orphans.sort(compareRioLinhasByNomeFantasia);
    const totals = sumRioLinhasTotals(sorted);
    blocks.push({
      id: "__sem_marca__",
      nome: "Sem MARCA",
      clienteCount: sorted.length,
      pdvTotal: totals.pdvTotal,
      valorTotalLabel: formatRioValorTotal(totals.valorHasAny, totals.valorTotal),
      clientes: sorted.map(mapFinanceiroLinha),
    });
  }

  return blocks;
}

function layoutFromPayload(layout: Awaited<ReturnType<typeof getProducaoCatalogLayout>>): ProducaoLayoutState {
  return {
    clienteNomes: layout.clienteNomes,
    pdvPlacements: layout.pdvPlacements,
    hiddenClienteKeys: layout.hiddenClienteKeys,
    customClientes: layout.customClientes,
    acknowledgedPdvs: layout.acknowledgedPdvs,
    movimentoBaselineEntradaIds: layout.movimentoBaselineEntradaIds,
    movimentoBaselineSaidaIds: layout.movimentoBaselineSaidaIds,
  };
}

export async function buildAtendimentoRelaPayload(): Promise<AtendimentoRelaPayload> {
  const yearMonth = await getProducaoRioSourceYm();
  const [rioBundle, vinculos, layout, linhasRio] = await Promise.all([
    getRioCompMonthWithLinhas(yearMonth),
    listVinculosForMonth(PRODUCAO_CATALOGO_LAYOUT_YM),
    getProducaoCatalogLayout(),
    loadRioLinhasForProducao(yearMonth),
  ]);

  const links = new Map<string, { portalPdvId: number; portalClienteId: number }>();
  for (const row of vinculos.rows ?? []) {
    if (!row.link) continue;
    links.set(row.rioPdvId, row.link);
  }

  const financeiro = buildFinanceiroBlocks(
    rioBundle?.grupos ?? [],
    (rioBundle?.linhas ?? []) as RioCompLinhaEnriched[],
  );

  const base = buildProducaoClientes(linhasRio, links);
  const caByLinhaId = buildCaByLinhaId(linhasRio);
  const merged = mergeProducaoLayout(base, layoutFromPayload(layout), { caByLinhaId });
  const visiveis = filterProducaoClientesVisiveis(merged);

  const pdvKeys = visiveis.flatMap((c) => c.pdvs.map((p) => p.rioPdvId));
  const cadastros =
    pdvKeys.length > 0 ?
      await prisma.producaoPdvCadastro.findMany({
        where: { rioPdvKey: { in: pdvKeys } },
        select: {
          rioPdvKey: true,
          cnpj: true,
          contatoLojaNome: true,
          contatoLojaEmail: true,
          contatoLojaTelefone: true,
        },
      })
    : [];
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const producao: RelaProducaoClienteRow[] = visiveis.map((c) => ({
    key: c.key,
    nome: c.nome,
    rioLinhaId: c.rioLinhaId,
    documento: c.documento,
    pdvCount: c.pdvCount,
    pdvs: c.pdvs.map((p) => {
      const cad = cadastroByKey.get(p.rioPdvId);
      return {
        rioPdvKey: p.rioPdvId,
        nome: p.nome,
        documento: cad?.cnpj?.trim() || p.documento,
        contatoLojaNome: formatCampo(cad?.contatoLojaNome),
        contatoLojaEmail: formatCampo(cad?.contatoLojaEmail),
        contatoLojaTelefone: formatCampo(cad?.contatoLojaTelefone),
        portalPdvId: p.portalPlayerId?.portalPdvId ?? null,
        portalPdvLabel:
          p.portalPlayerId ?
            formatPortalPdvIdDisplay(p.portalPlayerId.portalPdvId)
          : null,
        isLinhaProxy: Boolean(p.isLinhaProxy),
      };
    }),
  }));

  return {
    ok: true,
    yearMonth,
    geradoEm: new Date().toISOString(),
    financeiro,
    producao,
  };
}
