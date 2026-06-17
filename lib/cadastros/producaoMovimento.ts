import {
  buildCaByLinhaId,
  isLinhaAsPdvKey,
  linhaAsPdvKey,
  linhaIdFromAsPdvKey,
  type PdvPlacementOverride,
  type ProducaoClienteBucket,
  type ProducaoLayoutState,
  type ProducaoPdvRef,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { prisma } from "@/lib/prisma";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";
import { effectiveRioTagCobranca, type RioTagCobranca } from "@/lib/rio/rioTagCobranca";

/** Fila «Pendências» no topo da produção (entradas Rio ainda não posicionadas). */
export const PRODUCAO_MOVIMENTO_TOP_ENABLED = true;

export type RioMovimento = "estavel" | "entrada" | "saida";

export type ProducaoMovimentoItem = {
  kind: "pdv" | "cliente";
  rioPdvId: string;
  nome: string;
  documento: string | null;
  rioLinhaId: string;
  rioLinhaNome: string;
  movimento: "entrada" | "saida";
  painelLink: PainelLinkBrief | null;
  isLinhaProxy?: boolean;
  tagCobranca?: RioTagCobranca;
};

export type RioMovimentoLists = {
  novos: ProducaoMovimentoItem[];
  encerrados: ProducaoMovimentoItem[];
};

function nomeCliente(ln: RioLinhaForProducao): string {
  return ln.nomeFantasia.trim() || "Sem nome";
}

function acknowledgedSet(layout: ProducaoLayoutState): Set<string> {
  const set = new Set(layout.acknowledgedPdvs ?? []);
  for (const p of layout.pdvPlacements) set.add(p.rioPdvId);
  return set;
}

function baselineEntradaSet(layout: ProducaoLayoutState): Set<string> {
  return new Set(layout.movimentoBaselineEntradaIds ?? []);
}

function baselineSaidaSet(layout: ProducaoLayoutState): Set<string> {
  return new Set(layout.movimentoBaselineSaidaIds ?? []);
}

/** Todas as linhas/PDVs Rio (inclui saída) para congelar baseline de movimento. */
export async function loadRioLinhasForMovimentoBaseline(
  yearMonth: number,
): Promise<RioLinhaForProducao[]> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: { pdvs: { orderBy: [{ sortOrder: "asc" }] } },
      },
    },
  });
  if (!month) return [];
  return month.linhas.map((ln) => ({
    id: ln.id,
    caPersonId: ln.caPersonId,
    nomeFantasia: ln.nomeFantasia,
    razaoSocial: ln.razaoSocial,
    documento: ln.documento,
    movimento: ln.movimento,
    numeroPdvSite: ln.numeroPdvSite,
    pdvs: ln.pdvs.map((p) => ({
      id: p.id,
      nome: p.nome,
      documento: p.documento,
      movimento: p.movimento,
      tagCobranca: p.tagCobranca,
    })),
    tagCobranca: ln.tagCobranca,
  }));
}

/** IDs de entrada/saída atuais — usados uma vez para zerar pendências da organização inicial. */
export function collectMovimentoBaselineIds(linhas: RioLinhaForProducao[]): {
  entradaIds: string[];
  saidaIds: string[];
} {
  const entrada = new Set<string>();
  const saida = new Set<string>();

  for (const ln of linhas) {
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");

    if (ln.movimento === "saida") {
      saida.add(linhaAsPdvKey(ln.id));
    }
    if (ln.movimento === "entrada" && activePdvs.length === 0) {
      entrada.add(linhaAsPdvKey(ln.id));
    }

    for (const p of ln.pdvs) {
      if (p.movimento === "saida") saida.add(p.id);
      if (p.movimento === "entrada") entrada.add(p.id);
    }
  }

  return { entradaIds: [...entrada], saidaIds: [...saida] };
}

/** Sentinel: layout carregado de outro mês — não congela baseline automaticamente. */
const MOVIMENTO_BASELINE_SKIP = new Date(0);

/**
 * Congela entradas/saídas atuais como «já organizadas».
 * Só roda uma vez por competência (movimentoOrganizedAt ausente).
 */
export async function ensureProducaoMovimentoBaseline(yearMonth: number): Promise<{
  movimentoBaselineEntradaIds: string[];
  movimentoBaselineSaidaIds: string[];
  movimentoOrganizedAt: string | null;
}> {
  const row = await prisma.cadastroProducaoLayout.findUnique({ where: { yearMonth } });
  if (row?.movimentoOrganizedAt) {
    if (row.movimentoOrganizedAt.getTime() === MOVIMENTO_BASELINE_SKIP.getTime()) {
      return {
        movimentoBaselineEntradaIds: [],
        movimentoBaselineSaidaIds: [],
        movimentoOrganizedAt: null,
      };
    }
    return {
      movimentoBaselineEntradaIds: asJsonStringArray(row.movimentoBaselineEntradaIds),
      movimentoBaselineSaidaIds: asJsonStringArray(row.movimentoBaselineSaidaIds),
      movimentoOrganizedAt: row.movimentoOrganizedAt.toISOString(),
    };
  }

  const linhas = await loadRioLinhasForMovimentoBaseline(yearMonth);
  const { entradaIds, saidaIds } = collectMovimentoBaselineIds(linhas);
  const now = new Date();

  await prisma.cadastroProducaoLayout.upsert({
    where: { yearMonth },
    create: {
      yearMonth,
      movimentoBaselineEntradaIds: entradaIds,
      movimentoBaselineSaidaIds: saidaIds,
      movimentoOrganizedAt: now,
    },
    update: {
      movimentoBaselineEntradaIds: entradaIds,
      movimentoBaselineSaidaIds: saidaIds,
      movimentoOrganizedAt: now,
    },
  });

  return {
    movimentoBaselineEntradaIds: entradaIds,
    movimentoBaselineSaidaIds: saidaIds,
    movimentoOrganizedAt: now.toISOString(),
  };
}

function asJsonStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export { MOVIMENTO_BASELINE_SKIP };

export function stablePlacementKey(p: PdvPlacementOverride): string {
  const target = p.targetClienteKey.trim();
  const pdvId = p.rioPdvId.trim();
  // Vários PDVs na mesma linha Rio podem ir para pastas diferentes — nunca colapsar por linha.
  if (pdvId && !isLinhaAsPdvKey(pdvId)) {
    return `pdv:${pdvId}→${target}`;
  }
  const linha = p.rioLinhaId?.trim();
  if (linha) return `linha:${linha}→${target}`;
  const ca = p.caPersonId?.trim();
  if (ca) return `ca:${ca}→${target}`;
  return `pdv:${pdvId}→${target}`;
}

/** Completa metadados e reatacha IDs atuais — não muda destino editorial. */
export function enrichPlacementOverrides(
  placements: PdvPlacementOverride[],
  linhas: RioLinhaForProducao[],
): PdvPlacementOverride[] {
  const activeIds = collectActiveRioPdvIds(linhas);
  const linhaById = new Map(linhas.map((ln) => [ln.id, ln]));
  const caByLinha = buildCaByLinhaId(linhas);

  const enriched = placements.map((p) => {
    let out: PdvPlacementOverride = { ...p };

    if (!out.rioLinhaId?.trim()) {
      for (const ln of linhas) {
        if (ln.pdvs.some((pd) => pd.id === p.rioPdvId)) {
          out.rioLinhaId = ln.id;
          break;
        }
      }
      if (!out.rioLinhaId && isLinhaAsPdvKey(p.rioPdvId)) {
        out.rioLinhaId = linhaIdFromAsPdvKey(p.rioPdvId) ?? undefined;
      }
    }

    if (!out.caPersonId?.trim() && out.rioLinhaId) {
      const ca = caByLinha.get(out.rioLinhaId);
      if (ca) out.caPersonId = ca;
    }

    if (!activeIds.has(out.rioPdvId)) {
      const linhaId = out.rioLinhaId?.trim();
      if (linhaId) {
        const ln = linhaById.get(linhaId);
        const active = ln?.pdvs.filter((pd) => pd.movimento !== "saida") ?? [];
        if (active.length === 1) out.rioPdvId = active[0]!.id;
        else if (active.length === 0 && ln) out.rioPdvId = linhaAsPdvKey(linhaId);
      } else if (out.caPersonId?.trim()) {
        const ln = linhas.find((l) => l.caPersonId?.trim() === out.caPersonId?.trim());
        if (ln) {
          out.rioLinhaId = ln.id;
          const active = ln.pdvs.filter((pd) => pd.movimento !== "saida");
          if (active.length === 1) out.rioPdvId = active[0]!.id;
          else if (active.length === 0) out.rioPdvId = linhaAsPdvKey(ln.id);
        }
      }
    }

    return out;
  });

  const byStable = new Map<string, PdvPlacementOverride>();
  for (const p of enriched) {
    const key = stablePlacementKey(p);
    const prev = byStable.get(key);
    byStable.set(key, prev ? { ...prev, ...p } : p);
  }
  return [...byStable.values()];
}

/** Evita sobrescrever o banco com wipe acidental de arrastes. */
export function safeMergePlacements(
  current: PdvPlacementOverride[],
  incoming: PdvPlacementOverride[],
): PdvPlacementOverride[] {
  if (incoming.length === 0 && current.length > 0) return current;
  if (current.length === 0) return incoming;
  if (incoming.length >= current.length * 0.85) return incoming;

  const byStable = new Map<string, PdvPlacementOverride>();
  for (const p of current) byStable.set(stablePlacementKey(p), p);
  for (const p of incoming) byStable.set(stablePlacementKey(p), { ...byStable.get(stablePlacementKey(p)), ...p });
  return [...byStable.values()];
}

export async function loadRioLinhasForProducao(yearMonth: number): Promise<RioLinhaForProducao[]> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: { pdvs: { orderBy: [{ sortOrder: "asc" }] } },
      },
    },
  });
  if (!month) return [];
  return month.linhas
    .filter((ln) => ln.movimento !== "saida")
    .map((ln) => ({
      id: ln.id,
      caPersonId: ln.caPersonId,
      nomeFantasia: ln.nomeFantasia,
      razaoSocial: ln.razaoSocial,
      documento: ln.documento,
      movimento: ln.movimento,
      numeroPdvSite: ln.numeroPdvSite,
      pdvs: ln.pdvs
        .filter((p) => p.movimento !== "saida")
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          documento: p.documento,
          movimento: p.movimento,
          tagCobranca: p.tagCobranca,
        })),
      tagCobranca: ln.tagCobranca,
    }));
}

/** IDs de PDVs ativos na Rio (inclui proxies de linha sem PDV). */
export function collectActiveRioPdvIds(linhas: RioLinhaForProducao[]): Set<string> {
  const ids = new Set<string>();
  for (const ln of linhas) {
    const active = ln.pdvs.filter((p) => p.movimento !== "saida");
    if (active.length === 0 && ln.movimento !== "saida") {
      ids.add(linhaAsPdvKey(ln.id));
    }
    for (const p of active) ids.add(p.id);
  }
  return ids;
}

/**
 * Mantém arrastes salvos quando o ID do PDV muda (ex.: `linha:{id}` → PDV real após vínculo).
 * Não reorganiza grupos — só reatacha o mesmo destino a um ID ainda ativo.
 */
export function remapPlacementsToActivePdvs(
  linhas: RioLinhaForProducao[],
  placements: PdvPlacementOverride[],
): { placements: PdvPlacementOverride[]; remappedCount: number } {
  const activeIds = collectActiveRioPdvIds(linhas);
  const linhaById = new Map(linhas.map((ln) => [ln.id, ln]));
  let remappedCount = 0;
  const out: PdvPlacementOverride[] = [];

  for (const p of placements) {
    let rioPdvId = p.rioPdvId;

    if (!activeIds.has(rioPdvId)) {
      if (isLinhaAsPdvKey(rioPdvId)) {
        const linhaId = linhaIdFromAsPdvKey(rioPdvId);
        const ln = linhaId ? linhaById.get(linhaId) : undefined;
        const active = ln?.pdvs.filter((pdv) => pdv.movimento !== "saida") ?? [];
        if (active.length === 1) {
          rioPdvId = active[0]!.id;
          remappedCount += 1;
        }
      } else {
        const ca = p.caPersonId?.trim();
        if (ca) {
          const ln = linhas.find((l) => l.caPersonId?.trim() === ca && l.movimento !== "saida");
          if (ln) {
            const active = ln.pdvs.filter((pdv) => pdv.movimento !== "saida");
            if (active.length === 1) {
              rioPdvId = active[0]!.id;
              remappedCount += 1;
            } else if (active.length === 0) {
              const proxy = linhaAsPdvKey(ln.id);
              if (activeIds.has(proxy)) {
                rioPdvId = proxy;
                remappedCount += 1;
              }
            }
          }
        }
      }
    }

    if (!activeIds.has(rioPdvId)) continue;
    out.push({ ...p, rioPdvId });
  }

  const byPdv = new Map<string, PdvPlacementOverride>();
  for (const p of out) byPdv.set(p.rioPdvId, p);

  return { placements: [...byPdv.values()], remappedCount };
}

/** Reatacha `linha:{id}` antigos via `caPersonId` quando a Rio recria linhas. */
export function remapPlacementsByCaPerson(
  linhas: RioLinhaForProducao[],
  placements: PdvPlacementOverride[],
): PdvPlacementOverride[] {
  const caToProxy = new Map<string, string>();

  for (const ln of linhas) {
    const ca = ln.caPersonId?.trim();
    if (!ca || ln.movimento === "saida") continue;
    const active = ln.pdvs.filter((p) => p.movimento !== "saida");
    if (active.length === 0) {
      caToProxy.set(ca, linhaAsPdvKey(ln.id));
    }
  }

  return placements.map((p) => {
    const ca = p.caPersonId?.trim();
    if (!ca) return p;
    const proxy = caToProxy.get(ca);
    if (proxy && proxy !== p.rioPdvId) return { ...p, rioPdvId: proxy };
    return p;
  });
}

export type ReconcileProducaoLayoutResult = ProducaoLayoutState & {
  remappedPlacementCount: number;
  droppedPlacementCount: number;
};

/**
 * Ajusta metadados derivados (ack). Nunca altera nem reduz `pdvPlacements` gravados —
 * a organização manual só muda por ação explícita do usuário.
 */
export function reconcileProducaoLayout(
  linhas: RioLinhaForProducao[],
  layout: ProducaoLayoutState,
): ReconcileProducaoLayoutResult {
  const byCa = remapPlacementsByCaPerson(linhas, layout.pdvPlacements);
  const { remappedCount } = remapPlacementsToActivePdvs(linhas, byCa);
  const ack = acknowledgedSet(layout);
  return {
    ...layout,
    pdvPlacements: layout.pdvPlacements,
    acknowledgedPdvs: [...ack],
    remappedPlacementCount: remappedCount,
    droppedPlacementCount: 0,
  };
}

/** Extrai novos (entrada) e encerrados (saída) direto da Planilha Rio. */
export function extractRioMovimentos(
  linhas: RioLinhaForProducao[],
  linkMap: Map<string, PainelLinkBrief>,
  layout: ProducaoLayoutState,
): RioMovimentoLists {
  const ack = acknowledgedSet(layout);
  const baselineEntrada = baselineEntradaSet(layout);
  const baselineSaida = baselineSaidaSet(layout);
  const novos: ProducaoMovimentoItem[] = [];
  const encerrados: ProducaoMovimentoItem[] = [];

  for (const ln of linhas) {
    const nc = nomeCliente(ln);
    const linhaTag = ln.tagCobranca ?? "cobrando";
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");

    if (ln.movimento === "saida") {
      const proxyId = linhaAsPdvKey(ln.id);
      if (baselineSaida.has(proxyId)) continue;
      encerrados.push({
        kind: "cliente",
        rioPdvId: linhaAsPdvKey(ln.id),
        nome: nc,
        documento: ln.documento ?? null,
        rioLinhaId: ln.id,
        rioLinhaNome: nc,
        movimento: "saida",
        painelLink: linkMap.get(linhaAsPdvKey(ln.id)) ?? null,
        isLinhaProxy: true,
        tagCobranca: linhaTag,
      });
    }

    for (const p of ln.pdvs) {
      const pdvTag = effectiveRioTagCobranca(p.tagCobranca, linhaTag);
      if (p.movimento === "saida") {
        if (baselineSaida.has(p.id)) continue;
        encerrados.push({
          kind: "pdv",
          rioPdvId: p.id,
          nome: p.nome.trim() || nc,
          documento: p.documento,
          rioLinhaId: ln.id,
          rioLinhaNome: nc,
          movimento: "saida",
          painelLink: linkMap.get(p.id) ?? null,
          tagCobranca: pdvTag,
        });
      } else if (
        p.movimento === "entrada" &&
        !ack.has(p.id) &&
        !baselineEntrada.has(p.id)
      ) {
        novos.push({
          kind: "pdv",
          rioPdvId: p.id,
          nome: p.nome.trim() || nc,
          documento: p.documento,
          rioLinhaId: ln.id,
          rioLinhaNome: nc,
          movimento: "entrada",
          painelLink: linkMap.get(p.id) ?? null,
          tagCobranca: pdvTag,
        });
      }
    }

    if (activePdvs.length === 0 && ln.movimento === "entrada") {
      const proxyId = linhaAsPdvKey(ln.id);
      if (!ack.has(proxyId) && !baselineEntrada.has(proxyId)) {
        novos.push({
          kind: "cliente",
          rioPdvId: proxyId,
          nome: nc,
          documento: ln.documento ?? null,
          rioLinhaId: ln.id,
          rioLinhaNome: nc,
          movimento: "entrada",
          painelLink: linkMap.get(proxyId) ?? null,
          isLinhaProxy: true,
          tagCobranca: linhaTag,
        });
      }
    }
  }

  const sortFn = (a: ProducaoMovimentoItem, b: ProducaoMovimentoItem) =>
    a.rioLinhaNome.localeCompare(b.rioLinhaNome, "pt-BR", { sensitivity: "base" }) ||
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

  novos.sort(sortFn);
  encerrados.sort(sortFn);
  return { novos, encerrados };
}

/** Remove PDVs «novos» (ainda não organizados) dos buckets da produção. */
export function stripNovosFromClientes(
  clientes: ProducaoClienteBucket[],
  novos: ProducaoMovimentoItem[],
): ProducaoClienteBucket[] {
  const novoIds = new Set(novos.map((n) => n.rioPdvId));
  if (!novoIds.size) return clientes;
  return clientes.map((c) => {
    const pdvs = c.pdvs.filter((p) => !novoIds.has(p.rioPdvId));
    return { ...c, pdvs, pdvCount: pdvs.length };
  });
}

export function movimentoItemToPdvRef(item: ProducaoMovimentoItem): ProducaoPdvRef {
  return {
    rioPdvId: item.rioPdvId,
    nome: item.nome,
    documento: item.documento,
    rioLinhaId: item.rioLinhaId,
    rioLinhaNome: item.rioLinhaNome,
    painelLink: item.painelLink,
    isLinhaProxy: item.isLinhaProxy,
    movimento: item.movimento,
    tagCobranca: item.tagCobranca,
  };
}

export function prodNovoDropId() {
  return "prod-novos-drop";
}
