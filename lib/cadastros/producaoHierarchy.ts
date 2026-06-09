import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";

export const LINHA_AS_PDV_PREFIX = "linha:";

export function linhaAsPdvKey(linhaId: string): string {
  return `${LINHA_AS_PDV_PREFIX}${linhaId}`;
}

export function isLinhaAsPdvKey(key: string): boolean {
  return key.startsWith(LINHA_AS_PDV_PREFIX);
}

export type ProducaoPdvRef = {
  rioPdvId: string;
  nome: string;
  documento: string | null;
  rioLinhaId: string;
  rioLinhaNome: string;
  painelLink: PainelLinkBrief | null;
  /** Cliente Rio sem PDVs filhos — o próprio cliente vira um PDV na produção. */
  isLinhaProxy?: boolean;
};

export type ProducaoClienteBucket = {
  key: string;
  nome: string;
  rioLinhaId: string;
  documento: string | null;
  pdvs: ProducaoPdvRef[];
  pdvCount: number;
  /** Grupo criado manualmente na produção (não veio da Rio). */
  isCustom?: boolean;
};

export type RioLinhaForProducao = {
  id: string;
  nomeFantasia: string;
  razaoSocial?: string;
  documento?: string | null;
  pdvs: Array<{
    id: string;
    nome: string;
    documento: string | null;
    movimento: string;
  }>;
};

export type PdvPlacementOverride = {
  rioPdvId: string;
  targetClienteKey: string;
};

export type ProducaoCustomCliente = {
  key: string;
  nome: string;
};

export const CUSTOM_CLIENTE_PREFIX = "custom:";

export function isCustomClienteKey(key: string): boolean {
  return key.startsWith(CUSTOM_CLIENTE_PREFIX);
}

export function newCustomClienteKey(): string {
  return `${CUSTOM_CLIENTE_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Produção: um bucket por cliente Rio (sem marca).
 * - Com PDVs na Rio → só os PDVs vão para a direita.
 * - Sem PDVs → o cliente inteiro vira um PDV (proxy).
 */
export function buildProducaoClientes(
  linhas: RioLinhaForProducao[],
  linkByRioPdvId: Map<string, PainelLinkBrief>,
): ProducaoClienteBucket[] {
  const sorted = [...linhas].sort(compareRioLinhasByNomeFantasia);
  const out: ProducaoClienteBucket[] = [];

  for (const ln of sorted) {
    const nomeCliente = ln.nomeFantasia.trim() || "Sem nome";
    const activePdvs = sortRioPdvsByNome(ln.pdvs.filter((p) => p.movimento !== "saida"));
    const pdvs: ProducaoPdvRef[] = [];

    if (activePdvs.length === 0) {
      const proxyId = linhaAsPdvKey(ln.id);
      pdvs.push({
        rioPdvId: proxyId,
        nome: nomeCliente,
        documento: ln.documento ?? null,
        rioLinhaId: ln.id,
        rioLinhaNome: nomeCliente,
        painelLink: linkByRioPdvId.get(proxyId) ?? null,
        isLinhaProxy: true,
      });
    } else {
      for (const p of activePdvs) {
        pdvs.push({
          rioPdvId: p.id,
          nome: p.nome.trim() || nomeCliente,
          documento: p.documento,
          rioLinhaId: ln.id,
          rioLinhaNome: nomeCliente,
          painelLink: linkByRioPdvId.get(p.id) ?? null,
        });
      }
    }

    out.push({
      key: ln.id,
      nome: nomeCliente,
      rioLinhaId: ln.id,
      documento: ln.documento ?? null,
      pdvs,
      pdvCount: pdvs.length,
    });
  }

  return out;
}

export function applyClienteNomeOverrides(
  clientes: ProducaoClienteBucket[],
  nomes: Record<string, string>,
): ProducaoClienteBucket[] {
  if (!Object.keys(nomes).length) return clientes;
  return clientes.map((c) => {
    const override = nomes[c.key]?.trim();
    return override ? { ...c, nome: override } : c;
  });
}

export type ProducaoLayoutState = {
  clienteNomes: Record<string, string>;
  pdvPlacements: PdvPlacementOverride[];
  hiddenClienteKeys: string[];
  customClientes: ProducaoCustomCliente[];
};

/** Aplica arrastes, grupos manuais, nomes editados e oculta vazios não usados. */
export function mergeProducaoLayout(
  base: ProducaoClienteBucket[],
  layout: ProducaoLayoutState,
  opts?: { showHidden?: boolean },
): ProducaoClienteBucket[] {
  let list = applyPdvPlacementOverrides(base, layout.pdvPlacements);
  const keys = new Set(list.map((c) => c.key));

  for (const custom of layout.customClientes) {
    if (!custom.key || keys.has(custom.key)) continue;
    list.push({
      key: custom.key,
      nome: custom.nome.trim() || "Novo grupo",
      rioLinhaId: "",
      documento: null,
      pdvs: [],
      pdvCount: 0,
      isCustom: true,
    });
    keys.add(custom.key);
  }

  list = applyClienteNomeOverrides(list, layout.clienteNomes);

  list = list.map((c) => {
    const custom = layout.customClientes.find((x) => x.key === c.key);
    if (custom && !layout.clienteNomes[c.key]?.trim()) {
      return { ...c, nome: custom.nome.trim() || c.nome };
    }
    return c;
  });

  const hidden = new Set(layout.hiddenClienteKeys);
  if (!opts?.showHidden) {
    list = list.filter((c) => !(c.pdvCount === 0 && hidden.has(c.key)));
  }

  list.sort((a, b) => {
    const aEmpty = a.pdvCount === 0;
    const bEmpty = b.pdvCount === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });

  return list;
}

export function countHiddenEmptyClientes(
  base: ProducaoClienteBucket[],
  layout: ProducaoLayoutState,
): number {
  const merged = mergeProducaoLayout(base, layout, { showHidden: true });
  const hidden = new Set(layout.hiddenClienteKeys);
  return merged.filter((c) => c.pdvCount === 0 && hidden.has(c.key)).length;
}

/** Reaplica arrastes: PDV pode mudar de bucket de cliente. */
export function applyPdvPlacementOverrides(
  clientes: ProducaoClienteBucket[],
  overrides: PdvPlacementOverride[],
): ProducaoClienteBucket[] {
  if (!overrides.length) return clientes;

  const clone: ProducaoClienteBucket[] = JSON.parse(
    JSON.stringify(clientes),
  ) as ProducaoClienteBucket[];
  const byPdv = new Map(overrides.map((o) => [o.rioPdvId, o]));
  const detached: ProducaoPdvRef[] = [];

  for (const c of clone) {
    const keep: ProducaoPdvRef[] = [];
    for (const p of c.pdvs) {
      if (byPdv.has(p.rioPdvId)) detached.push(p);
      else keep.push(p);
    }
    c.pdvs = keep;
    c.pdvCount = keep.length;
  }

  for (const p of detached) {
    const o = byPdv.get(p.rioPdvId)!;
    const target = clone.find((c) => c.key === o.targetClienteKey);
    if (!target) continue;
    target.pdvs.push(p);
    target.pdvCount = target.pdvs.length;
  }

  for (const c of clone) {
    c.pdvs.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }

  return clone;
}

export function clientesForRioSelection(
  clientes: ProducaoClienteBucket[],
  sel: { tipo: "marca"; marcaNome: string } | { tipo: "cliente"; rioLinhaId: string } | null,
  rioLinhaIdsInMarca?: string[],
): ProducaoClienteBucket[] {
  if (!sel) return clientes;
  if (sel.tipo === "cliente") {
    const hit = clientes.filter((c) => c.rioLinhaId === sel.rioLinhaId);
    return hit.length ? hit : clientes;
  }
  if (rioLinhaIdsInMarca?.length) {
    const set = new Set(rioLinhaIdsInMarca);
    const hit = clientes.filter((c) => set.has(c.rioLinhaId));
    return hit.length ? hit : clientes;
  }
  return clientes;
}

export function findClienteForRioLinha(
  clientes: ProducaoClienteBucket[],
  rioLinhaId: string,
): ProducaoClienteBucket | null {
  return clientes.find((c) => c.rioLinhaId === rioLinhaId) ?? null;
}

export function prodPdvDragId(rioPdvId: string) {
  return `prod-pdv-${rioPdvId}`;
}

export function prodClienteDropId(clienteKey: string) {
  return `prod-cli-${clienteKey}`;
}
