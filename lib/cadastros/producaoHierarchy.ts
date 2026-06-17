import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import type { RioTagCobranca } from "@/lib/rio/rioTagCobranca";
import { effectiveRioTagCobranca } from "@/lib/rio/rioTagCobranca";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";

export const LINHA_AS_PDV_PREFIX = "linha:";

export function linhaAsPdvKey(linhaId: string): string {
  return `${LINHA_AS_PDV_PREFIX}${linhaId}`;
}

export function isLinhaAsPdvKey(key: string): boolean {
  return key.startsWith(LINHA_AS_PDV_PREFIX);
}

export function linhaIdFromAsPdvKey(key: string): string | null {
  if (!isLinhaAsPdvKey(key)) return null;
  const id = key.slice(LINHA_AS_PDV_PREFIX.length).trim();
  return id || null;
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
  movimento?: string;
  tagCobranca?: RioTagCobranca;
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
  tagCobranca?: RioTagCobranca;
};

export type RioLinhaForProducao = {
  id: string;
  caPersonId?: string;
  nomeFantasia: string;
  razaoSocial?: string;
  documento?: string | null;
  movimento?: string;
  tagCobranca?: RioTagCobranca;
  /** Coluna Nº PDV da Planilha Rio (cobrança) — pode ser maior que pdvs.length. */
  numeroPdvSite?: number;
  pdvs: Array<{
    id: string;
    nome: string;
    documento: string | null;
    movimento: string;
    tagCobranca?: RioTagCobranca;
  }>;
};

export type PdvPlacementOverride = {
  rioPdvId: string;
  targetClienteKey: string;
  /** ID estável CA — permite remapear após edições na Planilha Rio. */
  caPersonId?: string;
  /** Linha Rio — fallback quando o ID do PDV muda após sync/vínculo. */
  rioLinhaId?: string;
};

export function buildCaByLinhaId(linhas: RioLinhaForProducao[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const ln of linhas) {
    const ca = ln.caPersonId?.trim();
    if (ca) m.set(ln.id, ca);
  }
  return m;
}

/** Resolve arraste salvo → PDV(s) atuais na árvore (nunca descarta organização manual). */
export function resolvePlacementPdvIds(
  override: PdvPlacementOverride,
  allPdvs: ProducaoPdvRef[],
  caByLinhaId?: Map<string, string>,
): string[] {
  if (allPdvs.some((p) => p.rioPdvId === override.rioPdvId)) {
    return [override.rioPdvId];
  }

  const linhaId = override.rioLinhaId?.trim();
  if (linhaId) {
    const onLinha = allPdvs.filter((p) => p.rioLinhaId === linhaId);
    if (onLinha.length === 1) return [onLinha[0]!.rioPdvId];
    const proxy = allPdvs.find((p) => p.rioPdvId === override.rioPdvId);
    if (proxy) return [proxy.rioPdvId];
  }

  const ca = override.caPersonId?.trim();
  if (ca && caByLinhaId) {
    const linhaIdForCa = [...caByLinhaId.entries()].find(([, v]) => v === ca)?.[0];
    if (linhaIdForCa) {
      const onLinha = allPdvs.filter((p) => p.rioLinhaId === linhaIdForCa);
      if (onLinha.length === 1) return [onLinha[0]!.rioPdvId];
      const exact = onLinha.find((p) => p.rioPdvId === override.rioPdvId);
      if (exact) return [exact.rioPdvId];
    }
  }

  if (isLinhaAsPdvKey(override.rioPdvId)) {
    const proxyLinhaId = linhaIdFromAsPdvKey(override.rioPdvId);
    if (proxyLinhaId) {
      const onLinha = allPdvs.filter((p) => p.rioLinhaId === proxyLinhaId);
      if (onLinha.length === 1) return [onLinha[0]!.rioPdvId];
      const proxy = allPdvs.find((p) => p.rioPdvId === override.rioPdvId);
      if (proxy) return [proxy.rioPdvId];
    }
  }

  return [];
}

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
    const linhaTag = ln.tagCobranca ?? "cobrando";
    const activePdvs = sortRioPdvsByNome(ln.pdvs.filter((p) => p.movimento !== "saida"));
    const pdvs: ProducaoPdvRef[] = [];

    if (activePdvs.length === 0 && ln.movimento !== "saida") {
      const proxyId = linhaAsPdvKey(ln.id);
      pdvs.push({
        rioPdvId: proxyId,
        nome: nomeCliente,
        documento: ln.documento ?? null,
        rioLinhaId: ln.id,
        rioLinhaNome: nomeCliente,
        painelLink: linkByRioPdvId.get(proxyId) ?? null,
        isLinhaProxy: true,
        movimento: ln.movimento ?? "estavel",
        tagCobranca: linhaTag,
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
          movimento: p.movimento,
          tagCobranca: effectiveRioTagCobranca(p.tagCobranca, linhaTag),
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
      tagCobranca: linhaTag,
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
  /** PDVs novos (entrada) já organizados na produção — saem do topo verde. */
  acknowledgedPdvs?: string[];
  /** Entradas Rio já existentes quando a produção foi organizada — ignoradas em pendências. */
  movimentoBaselineEntradaIds?: string[];
  /** Saídas Rio já existentes quando a produção foi organizada — ignoradas em encerrados. */
  movimentoBaselineSaidaIds?: string[];
};

function withCustomBuckets(
  clientes: ProducaoClienteBucket[],
  customClientes: ProducaoCustomCliente[],
): ProducaoClienteBucket[] {
  const list: ProducaoClienteBucket[] = JSON.parse(
    JSON.stringify(clientes),
  ) as ProducaoClienteBucket[];
  const keys = new Set(list.map((c) => c.key));
  for (const custom of customClientes) {
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
  return list;
}

/** Aplica arrastes, grupos manuais, nomes editados e oculta vazios não usados. */
export function mergeProducaoLayout(
  base: ProducaoClienteBucket[],
  layout: ProducaoLayoutState,
  opts?: { showHidden?: boolean; caByLinhaId?: Map<string, string> },
): ProducaoClienteBucket[] {
  let list = withCustomBuckets(base, layout.customClientes);
  list = applyPdvPlacementOverrides(list, layout.pdvPlacements, {
    caByLinhaId: opts?.caByLinhaId,
  });

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
  opts?: { caByLinhaId?: Map<string, string> },
): ProducaoClienteBucket[] {
  if (!overrides.length) return clientes;

  const clone: ProducaoClienteBucket[] = JSON.parse(
    JSON.stringify(clientes),
  ) as ProducaoClienteBucket[];
  const allPdvs = clone.flatMap((c) => c.pdvs);
  const pdvIdsToMove = new Set<string>();
  const pdvIdToTarget = new Map<string, string>();

  for (const o of overrides) {
    for (const id of resolvePlacementPdvIds(o, allPdvs, opts?.caByLinhaId)) {
      pdvIdsToMove.add(id);
      pdvIdToTarget.set(id, o.targetClienteKey);
    }
  }

  const detached: ProducaoPdvRef[] = [];

  for (const c of clone) {
    const keep: ProducaoPdvRef[] = [];
    for (const p of c.pdvs) {
      if (pdvIdsToMove.has(p.rioPdvId)) detached.push(p);
      else keep.push(p);
    }
    c.pdvs = keep;
    c.pdvCount = keep.length;
  }

  for (const p of detached) {
    const targetKey = pdvIdToTarget.get(p.rioPdvId);
    if (!targetKey) continue;
    let target = clone.find((c) => c.key === targetKey);
    if (!target && !isCustomClienteKey(targetKey)) {
      target = clone.find((c) => c.rioLinhaId === p.rioLinhaId);
    }
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

/** Total de PDVs ativos na Planilha Rio (proxy = 1 quando linha sem PDV). */
export function countRioPlanilhaPdvs(linhas: RioLinhaForProducao[]): number {
  let n = 0;
  for (const ln of linhas) {
    if (ln.movimento === "saida") continue;
    const active = ln.pdvs.filter((p) => p.movimento !== "saida");
    if (active.length === 0) n += 1;
    else n += active.length;
  }
  return n;
}

/** PDVs únicos exibidos na produção (após layout/arrastes). */
export function countProducaoMusicalPdvs(clientes: ProducaoClienteBucket[]): number {
  const ids = new Set<string>();
  for (const c of clientes) {
    for (const p of c.pdvs) ids.add(p.rioPdvId);
  }
  return ids.size;
}

/** Bucket Rio esvaziado após arrastar PDVs para outro grupo. */
export function isEmptyRioShellBucket(c: ProducaoClienteBucket): boolean {
  if (c.pdvCount > 0) return false;
  if (c.isCustom || isCustomClienteKey(c.key)) return false;
  return true;
}

/** Lista só grupos com PDV; em edição mantém grupos manuais vazios (alvo de arraste). */
export function filterProducaoClientesVisiveis(
  clientes: ProducaoClienteBucket[],
  opts?: { keepEmptyCustom?: boolean },
): ProducaoClienteBucket[] {
  return clientes.filter((c) => {
    if (c.pdvCount > 0) return true;
    if (opts?.keepEmptyCustom && (c.isCustom || isCustomClienteKey(c.key))) return true;
    return false;
  });
}

export function collectEmptyRioShellKeys(clientes: ProducaoClienteBucket[]): string[] {
  return clientes.filter(isEmptyRioShellBucket).map((c) => c.key);
}
