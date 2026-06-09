import {
  linhaAsPdvKey,
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

/** Remove arrastes obsoletos e garante acknowledged para PDVs já posicionados. */
export function reconcileProducaoLayout(
  linhas: RioLinhaForProducao[],
  layout: ProducaoLayoutState,
): ProducaoLayoutState {
  const activeIds = collectActiveRioPdvIds(linhas);
  const pdvPlacements = layout.pdvPlacements.filter((p) => activeIds.has(p.rioPdvId));
  const ack = acknowledgedSet({ ...layout, pdvPlacements });
  return {
    ...layout,
    pdvPlacements,
    acknowledgedPdvs: [...ack],
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
