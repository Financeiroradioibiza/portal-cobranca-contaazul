import { compareRioLinhasByNomeFantasia, sortRioCompGruposForDisplay } from "@/lib/rio/sortRioCompLinhas";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { effectiveRioTagCobranca, type RioTagCobranca } from "@/lib/rio/rioTagCobranca";
import type { PortalPlayerIdBrief } from "@/lib/player/portalPlayerIds";

/** @deprecated use PortalPlayerIdBrief */
export type PainelLinkBrief = PortalPlayerIdBrief;

export type ProducaoPdvNode = {
  id: string;
  nome: string;
  documento: string | null;
  movimento: string;
  tagCobranca: RioTagCobranca;
  portalPlayerId: PortalPlayerIdBrief | null;
};

export type ProducaoClienteNode = {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  origemCliente: string;
  tagCobranca: RioTagCobranca;
  pdvs: ProducaoPdvNode[];
  linkedCount: number;
};

export type ProducaoGrupoNode = {
  id: string;
  nome: string;
  systemTag: string | null;
  clientes: ProducaoClienteNode[];
  pdvCount: number;
  linkedCount: number;
};

export type RioMonthBundle = {
  grupos: Array<{ id: string; nome: string; sortOrder: number; systemTag?: string | null }>;
  linhas: Array<{
    id: string;
    rioGrupoId: string | null;
    nomeFantasia: string;
    razaoSocial: string;
    documento: string | null;
    origemCliente: string;
    caPersonId?: string;
    movimento?: string;
    tagCobranca?: RioTagCobranca;
    grupo?: { id: string; nome: string } | null;
    pdvs: Array<{
      id: string;
      nome: string;
      documento: string | null;
      movimento: string;
      tagCobranca?: RioTagCobranca;
    }>;
  }>;
};

const SEM_MARCA_ID = "__sem_marca__";

function grupoColor(nome: string): string {
  const palette = ["#C4146A", "#1565C0", "#2E7D32", "#C4511A", "#6A1B9A", "#00695C"];
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h + nome.charCodeAt(i) * 17) % palette.length;
  return palette[h]!;
}

export function grupoIconStyle(nome: string): { background: string; initial: string } {
  const n = nome.trim() || "?";
  return { background: grupoColor(n), initial: n.charAt(0).toUpperCase() };
}

export function buildProducaoTree(
  bundle: RioMonthBundle,
  linkByRioPdvId: Map<string, PainelLinkBrief>,
): ProducaoGrupoNode[] {
  const gruposSorted = sortRioCompGruposForDisplay(
    bundle.grupos.filter((g) => !g.systemTag),
  );

  const grupoMap = new Map<string, ProducaoGrupoNode>();
  for (const g of gruposSorted) {
    grupoMap.set(g.id, {
      id: g.id,
      nome: g.nome,
      systemTag: g.systemTag ?? null,
      clientes: [],
      pdvCount: 0,
      linkedCount: 0,
    });
  }

  grupoMap.set(SEM_MARCA_ID, {
    id: SEM_MARCA_ID,
    nome: "Sem marca",
    systemTag: null,
    clientes: [],
    pdvCount: 0,
    linkedCount: 0,
  });

  const linhasSorted = [...bundle.linhas].sort(compareRioLinhasByNomeFantasia);

  for (const ln of linhasSorted) {
    const gid = ln.rioGrupoId && grupoMap.has(ln.rioGrupoId) ? ln.rioGrupoId : SEM_MARCA_ID;
    const grupo = grupoMap.get(gid)!;

    const linhaTag = ln.tagCobranca ?? "cobrando";
    const pdvsVisiveis = sortRioPdvsByNome(ln.pdvs.filter((p) => p.movimento !== "saida"));

    const pdvNodes: ProducaoPdvNode[] = pdvsVisiveis.map((p) => ({
      id: p.id,
      nome: p.nome,
      documento: p.documento,
      movimento: p.movimento,
      tagCobranca: effectiveRioTagCobranca(p.tagCobranca, linhaTag),
      portalPlayerId: linkByRioPdvId.get(p.id) ?? null,
    }));

    let linked = 0;
    for (const p of pdvNodes) {
      if (p.portalPlayerId) linked += 1;
    }

    grupo.clientes.push({
      id: ln.id,
      nomeFantasia: ln.nomeFantasia,
      razaoSocial: ln.razaoSocial,
      documento: ln.documento,
      origemCliente: ln.origemCliente,
      tagCobranca: linhaTag,
      pdvs: pdvNodes,
      linkedCount: linked,
    });
    grupo.pdvCount += pdvNodes.length;
    grupo.linkedCount += linked;
  }

  for (const g of grupoMap.values()) {
    g.clientes.sort((a, b) => compareRioLinhasByNomeFantasia(a, b));
  }

  const out = [...grupoMap.values()].filter((g) => g.clientes.length > 0);
  const semIdx = out.findIndex((g) => g.id === SEM_MARCA_ID);
  if (semIdx > 0) {
    const [sem] = out.splice(semIdx, 1);
    out.push(sem!);
  }
  return out;
}

export type RioMovimentoRow = {
  kind: "pdv" | "cliente";
  id: string;
  nome: string;
  clienteNome: string;
  movimento: "entrada" | "saida";
  portalPlayerId: PortalPlayerIdBrief | null;
};

/** Listas de entrada/saída da Planilha Rio para o topo da coluna esquerda. */
export function extractRioTreeMovimentos(
  bundle: RioMonthBundle,
  linkByRioPdvId: Map<string, PainelLinkBrief>,
): { novos: RioMovimentoRow[]; encerrados: RioMovimentoRow[] } {
  const novos: RioMovimentoRow[] = [];
  const encerrados: RioMovimentoRow[] = [];

  for (const ln of bundle.linhas) {
    const clienteNome = ln.nomeFantasia.trim() || "Sem nome";
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");

    if (ln.movimento === "saida") {
      encerrados.push({
        kind: "cliente",
        id: ln.id,
        nome: clienteNome,
        clienteNome,
        movimento: "saida",
        portalPlayerId: null,
      });
    }

    for (const p of ln.pdvs) {
      if (p.movimento === "saida") {
        encerrados.push({
          kind: "pdv",
          id: p.id,
          nome: p.nome,
          clienteNome,
          movimento: "saida",
          portalPlayerId: linkByRioPdvId.get(p.id) ?? null,
        });
      } else if (p.movimento === "entrada") {
        novos.push({
          kind: "pdv",
          id: p.id,
          nome: p.nome,
          clienteNome,
          movimento: "entrada",
          portalPlayerId: linkByRioPdvId.get(p.id) ?? null,
        });
      }
    }

    if (activePdvs.length === 0 && ln.movimento === "entrada") {
      novos.push({
        kind: "cliente",
        id: ln.id,
        nome: clienteNome,
        clienteNome,
        movimento: "entrada",
        portalPlayerId: null,
      });
    }
  }

  const sortFn = (a: RioMovimentoRow, b: RioMovimentoRow) =>
    a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" }) ||
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

  novos.sort(sortFn);
  encerrados.sort(sortFn);
  return { novos, encerrados };
}

export function treeStats(grupos: ProducaoGrupoNode[]): {
  grupos: number;
  clientes: number;
  pdvs: number;
  linked: number;
} {
  let clientes = 0;
  let pdvs = 0;
  let linked = 0;
  for (const g of grupos) {
    clientes += g.clientes.length;
    pdvs += g.pdvCount;
    linked += g.linkedCount;
  }
  return { grupos: grupos.length, clientes, pdvs, linked };
}
