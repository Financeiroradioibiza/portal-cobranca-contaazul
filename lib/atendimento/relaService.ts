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
import { listVinculosForMonth } from "@/lib/player/listPortalPlayerRows";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { getRioCompMonthWithLinhas, type RioCompGrupoDto } from "@/lib/rio/rioClienteCompService";
import type { RioCompLinhaEnriched } from "@/lib/rio/enrichRioLinhasPrimeiroPing";
import { sortRioCompGruposForDisplay } from "@/lib/rio/sortRioCompLinhas";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import { valorClienteTextoFromPdvUnit } from "@/lib/rio/valorClienteCalc";

export type RelaFinanceiroPdvRow = {
  id: string;
  nome: string;
  documento: string | null;
  primeiroPingEm: string | null;
};

export type RelaFinanceiroClienteRow = {
  id: string;
  marcaBloco: string;
  cliente: string;
  cnpj: string;
  valor: string;
  nPdvs: number;
  emailCobranca: string;
  primeiroPingEm: string | null;
  pdvs: RelaFinanceiroPdvRow[];
};

export type RelaProducaoPdvRow = {
  rioPdvKey: string;
  nome: string;
  documento: string | null;
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
  financeiro: RelaFinanceiroClienteRow[];
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

function mapFinanceiroLinha(
  ln: RioCompLinhaEnriched,
  marcaBloco: string,
): RelaFinanceiroClienteRow {
  const pdvsVisiveis = activePdvs(ln.pdvs);
  const pdvs: RelaFinanceiroPdvRow[] = pdvsVisiveis.map((p) => ({
    id: p.id,
    nome: p.nome,
    documento: p.documento,
    primeiroPingEm: (p as { primeiroPingEm?: string | null }).primeiroPingEm ?? null,
  }));

  const primeiroPingEm =
    pdvs.length > 0 ?
      earliestIso(pdvs.map((p) => p.primeiroPingEm))
    : (ln.primeiroPingEm ?? null);

  const nPdvs =
    (ln.numeroPdvSite ?? 0) > 0 ? ln.numeroPdvSite! : pdvs.length > 0 ? pdvs.length : 1;

  return {
    id: ln.id,
    marcaBloco,
    cliente: ln.nomeFantasia?.trim() || ln.razaoSocial?.trim() || "—",
    cnpj: formatDoc(ln.documento),
    valor: linhaValorDisplay(ln),
    nPdvs,
    emailCobranca: formatEmail(ln.emailCobranca),
    primeiroPingEm,
    pdvs,
  };
}

function buildFinanceiroRows(
  grupos: RioCompGrupoDto[],
  linhas: RioCompLinhaEnriched[],
): RelaFinanceiroClienteRow[] {
  const gruposOrd = sortRioCompGruposForDisplay(
    grupos.filter((g) => !g.systemTag),
  );
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

  const rows: RelaFinanceiroClienteRow[] = [];
  for (const g of gruposOrd) {
    const list = (byGrupo.get(g.id) ?? []).sort(compareRioLinhasByNomeFantasia);
    for (const ln of list) {
      rows.push(mapFinanceiroLinha(ln, g.nome));
    }
  }
  for (const ln of orphans.sort(compareRioLinhasByNomeFantasia)) {
    rows.push(mapFinanceiroLinha(ln, "Sem marca"));
  }
  return rows;
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

  const financeiro = buildFinanceiroRows(
    rioBundle?.grupos ?? [],
    (rioBundle?.linhas ?? []) as RioCompLinhaEnriched[],
  );

  const base = buildProducaoClientes(linhasRio, links);
  const caByLinhaId = buildCaByLinhaId(linhasRio);
  const merged = mergeProducaoLayout(base, layoutFromPayload(layout), { caByLinhaId });
  const visiveis = filterProducaoClientesVisiveis(merged);

  const producao: RelaProducaoClienteRow[] = visiveis.map((c) => ({
    key: c.key,
    nome: c.nome,
    rioLinhaId: c.rioLinhaId,
    documento: c.documento,
    pdvCount: c.pdvCount,
    pdvs: c.pdvs.map((p) => ({
      rioPdvKey: p.rioPdvId,
      nome: p.nome,
      documento: p.documento,
      portalPdvId: p.portalPlayerId?.portalPdvId ?? null,
      portalPdvLabel:
        p.portalPlayerId ?
          formatPortalPdvIdDisplay(p.portalPlayerId.portalPdvId)
        : null,
      isLinhaProxy: Boolean(p.isLinhaProxy),
    })),
  }));

  return {
    ok: true,
    yearMonth,
    geradoEm: new Date().toISOString(),
    financeiro,
    producao,
  };
}
