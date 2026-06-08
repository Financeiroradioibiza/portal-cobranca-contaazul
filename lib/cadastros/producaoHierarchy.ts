import { stripDiacritics } from "@/lib/textNormalize";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";

export type RioOrigemLayout = "marca" | "sem_marca" | "cliente";

export type ProducaoPdvRef = {
  rioPdvId: string;
  nome: string;
  documento: string | null;
  rioLinhaId: string;
  rioLinhaNome: string;
  painelLink: PainelLinkBrief | null;
};

export type ProducaoProgramaNode = {
  id: string;
  nome: string;
  pdvs: ProducaoPdvRef[];
};

export type ProducaoSubClienteNode = {
  key: string;
  nome: string;
  rioOrigem: RioOrigemLayout;
  marcaRio: string | null;
  rioLinhaIds: string[];
  programas: ProducaoProgramaNode[];
  pdvCount: number;
};

export type ProducaoMasterNode = {
  key: string;
  nome: string;
  subClientes: ProducaoSubClienteNode[];
  pdvCount: number;
};

export type RioLinhaForProducao = {
  id: string;
  nomeFantasia: string;
  marcaNome: string | null;
  semMarca: boolean;
  pdvs: Array<{
    id: string;
    nome: string;
    documento: string | null;
    movimento: string;
  }>;
};

const DEFAULT_PROGRAMA = "Programa principal";

function norm(s: string): string {
  return stripDiacritics(s.trim().toLowerCase()).replace(/\s+/g, " ");
}

function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function firstToken(s: string): string {
  const m = norm(s).match(/^[\p{L}\p{N}]+/u);
  return m?.[0] ?? "";
}

/** Classifica linha Rio → master + sub-cliente de produção. */
export function classifyProducaoSlot(ln: RioLinhaForProducao): {
  masterNome: string;
  masterKey: string;
  subNome: string;
  subKey: string;
  rioOrigem: RioOrigemLayout;
} {
  const nome = ln.nomeFantasia.trim() || "Sem nome";
  const n = norm(nome);
  const marca = ln.marcaNome?.trim() ?? "";

  let masterNome = "";
  let subNome = nome;

  if (/reserva\s+mini/.test(n)) {
    masterNome = "Reserva";
    subNome = "Reserva Mini";
  } else if (/oficina\s+reserva/.test(n)) {
    masterNome = "Reserva";
    subNome = "Oficina Reserva";
  } else if (/^reserva\b/.test(n) || (marca && norm(marca).startsWith("reserva"))) {
    masterNome = "Reserva";
    subNome = nome;
    if (/franquia|franq|licenciado/.test(n)) subNome = nome;
    else if (/propria|própria|proprias|próprias/.test(n)) {
      subNome = nome.includes("—") || nome.includes("-") ? nome : "Reserva — Próprias";
    }
  } else if (/\bhering\b/.test(n) || (marca && norm(marca).includes("hering"))) {
    masterNome = "Hering";
    if (/franquia|ponto\s*franq|licenciado/.test(n)) subNome = "Hering — ponto franquia";
    else if (/propria|própria|proprias|próprias/.test(n)) subNome = "Hering — Próprias";
    else subNome = nome;
  } else if (/\bagilita\b/.test(n) || (marca && norm(marca).includes("agilita"))) {
    masterNome = "Agilita";
    subNome = nome.replace(/^\s*\./, "").trim() || "Agilita";
  } else if (marca && marca.length >= 3) {
    const marcaTok = firstToken(marca);
    if (marcaTok.length >= 3 && (n.startsWith(marcaTok) || n.includes(marcaTok))) {
      masterNome = titleCase(marcaTok);
      subNome = nome;
    }
  }

  if (!masterNome) {
    const tok = firstToken(nome);
    masterNome = tok.length >= 3 ? titleCase(tok) : nome;
    subNome = nome;
  }

  if (/^\.?\s*arezzo/.test(n) || (marca && norm(marca).includes("arezzo"))) {
    masterNome = "Arezzo";
    if (/propria|própria|proprias|próprias/.test(n)) subNome = "Arezzo — Próprias";
  }

  const rioOrigem: RioOrigemLayout =
    ln.semMarca ? "sem_marca"
    : marca ? "marca"
    : "cliente";

  const masterKey = slug(masterNome);
  const subKey = `${masterKey}__${slug(subNome)}`;

  return {
    masterNome,
    masterKey,
    subNome,
    subKey,
    rioOrigem,
  };
}

export function buildProducaoHierarchy(
  linhas: RioLinhaForProducao[],
  linkByRioPdvId: Map<string, PainelLinkBrief>,
): ProducaoMasterNode[] {
  const masterMap = new Map<string, ProducaoMasterNode>();
  const subMap = new Map<string, ProducaoSubClienteNode>();

  const sorted = [...linhas].sort(compareRioLinhasByNomeFantasia);

  for (const ln of sorted) {
    const slot = classifyProducaoSlot(ln);
    let master = masterMap.get(slot.masterKey);
    if (!master) {
      master = {
        key: slot.masterKey,
        nome: slot.masterNome,
        subClientes: [],
        pdvCount: 0,
      };
      masterMap.set(slot.masterKey, master);
    }

    let sub = subMap.get(slot.subKey);
    if (!sub) {
      sub = {
        key: slot.subKey,
        nome: slot.subNome,
        rioOrigem: slot.rioOrigem,
        marcaRio: ln.marcaNome,
        rioLinhaIds: [],
        programas: [
          {
            id: `${slot.subKey}__prog-default`,
            nome: DEFAULT_PROGRAMA,
            pdvs: [],
          },
        ],
        pdvCount: 0,
      };
      subMap.set(slot.subKey, sub);
      master.subClientes.push(sub);
    }

    if (!sub.rioLinhaIds.includes(ln.id)) sub.rioLinhaIds.push(ln.id);

    const pdvs = sortRioPdvsByNome(ln.pdvs.filter((p) => p.movimento !== "saida"));
    const prog = sub.programas[0]!;
    for (const p of pdvs) {
      prog.pdvs.push({
        rioPdvId: p.id,
        nome: p.nome,
        documento: p.documento,
        rioLinhaId: ln.id,
        rioLinhaNome: ln.nomeFantasia,
        painelLink: linkByRioPdvId.get(p.id) ?? null,
      });
      sub.pdvCount += 1;
      master.pdvCount += 1;
    }
  }

  const masters = [...masterMap.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
  for (const m of masters) {
    m.subClientes.sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
    );
    for (const s of m.subClientes) {
      for (const pr of s.programas) {
        pr.pdvs.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      }
    }
  }
  return masters;
}

/** Masters de produção ligados a uma seleção na árvore Rio. */
export function mastersForRioSelection(
  masters: ProducaoMasterNode[],
  sel: { tipo: "marca"; marcaNome: string } | { tipo: "cliente"; rioLinhaId: string } | null,
): ProducaoMasterNode[] {
  if (!sel) return masters;
  if (sel.tipo === "cliente") {
    const hit = masters.filter((m) =>
      m.subClientes.some((s) => s.rioLinhaIds.includes(sel.rioLinhaId)),
    );
    return hit.length ? hit : masters;
  }
  const needle = norm(sel.marcaNome);
  return masters.filter((m) =>
    m.subClientes.some((s) => s.marcaRio && norm(s.marcaRio) === needle),
  );
}

export function findSubClienteForRioLinha(
  masters: ProducaoMasterNode[],
  rioLinhaId: string,
): { master: ProducaoMasterNode; sub: ProducaoSubClienteNode } | null {
  for (const m of masters) {
    for (const s of m.subClientes) {
      if (s.rioLinhaIds.includes(rioLinhaId)) return { master: m, sub: s };
    }
  }
  return null;
}

export type PdvPlacementOverride = {
  rioPdvId: string;
  targetSubKey: string;
  targetProgramaId: string;
};

/** Reaplica overrides de arraste (PDV mudou de sub/programa). */
export function applyPdvPlacementOverrides(
  masters: ProducaoMasterNode[],
  overrides: PdvPlacementOverride[],
): ProducaoMasterNode[] {
  if (!overrides.length) return masters;

  const clone: ProducaoMasterNode[] = JSON.parse(JSON.stringify(masters)) as ProducaoMasterNode[];
  const byPdv = new Map(overrides.map((o) => [o.rioPdvId, o]));

  const detached: ProducaoPdvRef[] = [];

  for (const m of clone) {
    for (const s of m.subClientes) {
      for (const pr of s.programas) {
        const keep: ProducaoPdvRef[] = [];
        for (const p of pr.pdvs) {
          if (byPdv.has(p.rioPdvId)) detached.push(p);
          else keep.push(p);
        }
        pr.pdvs = keep;
      }
      s.pdvCount = s.programas.reduce((n, pr) => n + pr.pdvs.length, 0);
    }
    m.pdvCount = m.subClientes.reduce((n, s) => n + s.pdvCount, 0);
  }

  for (const p of detached) {
    const o = byPdv.get(p.rioPdvId)!;
    for (const m of clone) {
      const sub = m.subClientes.find((s) => s.key === o.targetSubKey);
      if (!sub) continue;
      const prog = sub.programas.find((pr) => pr.id === o.targetProgramaId) ?? sub.programas[0];
      if (!prog) continue;
      prog.pdvs.push(p);
      sub.pdvCount += 1;
      m.pdvCount += 1;
      break;
    }
  }

  return clone;
}

export function prodPdvDragId(rioPdvId: string) {
  return `prod-pdv-${rioPdvId}`;
}

export function prodProgDropId(subKey: string, programaId: string) {
  return `prod-drop-${subKey}__${programaId}`;
}
