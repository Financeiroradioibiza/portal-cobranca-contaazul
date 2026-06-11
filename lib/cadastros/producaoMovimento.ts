import {
  isLinhaAsPdvKey,
  linhaAsPdvKey,
  linhaIdFromAsPdvKey,
  type PdvPlacementOverride,
  type ProducaoClienteBucket,
  type ProducaoLayoutState,
  type ProducaoPdvRef,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";

/**
 * Seções «Novos/Encerrados na produção» no topo da coluna direita.
 * Desligado enquanto a Planilha Rio é organizada; ativar na virada de mês.
 */
export const PRODUCAO_MOVIMENTO_TOP_ENABLED = false;

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

/** Remapeia IDs estáveis; não reorganiza grupos automaticamente. */
export function reconcileProducaoLayout(
  linhas: RioLinhaForProducao[],
  layout: ProducaoLayoutState,
): ReconcileProducaoLayoutResult {
  const byCa = remapPlacementsByCaPerson(linhas, layout.pdvPlacements);
  const { placements: pdvPlacements, remappedCount } = remapPlacementsToActivePdvs(linhas, byCa);
  const droppedPlacementCount = layout.pdvPlacements.length - pdvPlacements.length;
  const ack = acknowledgedSet({ ...layout, pdvPlacements });
  return {
    ...layout,
    pdvPlacements,
    acknowledgedPdvs: [...ack],
    remappedPlacementCount: remappedCount,
    droppedPlacementCount,
  };
}

/** Extrai novos (entrada) e encerrados (saída) direto da Planilha Rio. */
export function extractRioMovimentos(
  linhas: RioLinhaForProducao[],
  linkMap: Map<string, PainelLinkBrief>,
  layout: ProducaoLayoutState,
): RioMovimentoLists {
  const ack = acknowledgedSet(layout);
  const novos: ProducaoMovimentoItem[] = [];
  const encerrados: ProducaoMovimentoItem[] = [];

  for (const ln of linhas) {
    const nc = nomeCliente(ln);
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");

    if (ln.movimento === "saida") {
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
      });
    }

    for (const p of ln.pdvs) {
      if (p.movimento === "saida") {
        encerrados.push({
          kind: "pdv",
          rioPdvId: p.id,
          nome: p.nome.trim() || nc,
          documento: p.documento,
          rioLinhaId: ln.id,
          rioLinhaNome: nc,
          movimento: "saida",
          painelLink: linkMap.get(p.id) ?? null,
        });
      } else if (p.movimento === "entrada" && !ack.has(p.id)) {
        novos.push({
          kind: "pdv",
          rioPdvId: p.id,
          nome: p.nome.trim() || nc,
          documento: p.documento,
          rioLinhaId: ln.id,
          rioLinhaNome: nc,
          movimento: "entrada",
          painelLink: linkMap.get(p.id) ?? null,
        });
      }
    }

    if (activePdvs.length === 0 && ln.movimento === "entrada") {
      const proxyId = linhaAsPdvKey(ln.id);
      if (!ack.has(proxyId)) {
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
  };
}

export function prodNovoDropId() {
  return "prod-novos-drop";
}
