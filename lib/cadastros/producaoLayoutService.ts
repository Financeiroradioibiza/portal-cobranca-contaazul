import { prisma } from "@/lib/prisma";
import type {
  PdvPlacementOverride,
  ProducaoCustomCliente,
} from "@/lib/cadastros/producaoHierarchy";

export type ProducaoLayoutPayload = {
  yearMonth: number;
  clienteNomes: Record<string, string>;
  pdvPlacements: PdvPlacementOverride[];
  hiddenClienteKeys: string[];
  customClientes: ProducaoCustomCliente[];
  acknowledgedPdvs: string[];
};

function asRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function asPlacements(v: unknown): PdvPlacementOverride[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      rioPdvId: typeof x.rioPdvId === "string" ? x.rioPdvId : "",
      targetClienteKey: typeof x.targetClienteKey === "string" ? x.targetClienteKey : "",
      caPersonId: typeof x.caPersonId === "string" ? x.caPersonId : undefined,
    }))
    .filter((x) => x.rioPdvId && x.targetClienteKey);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asCustomClientes(v: unknown): ProducaoCustomCliente[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      key: typeof x.key === "string" ? x.key : "",
      nome: typeof x.nome === "string" ? x.nome : "",
    }))
    .filter((x) => x.key && x.nome);
}

export async function getProducaoLayout(yearMonth: number): Promise<ProducaoLayoutPayload> {
  const row = await prisma.cadastroProducaoLayout.findUnique({ where: { yearMonth } });
  return {
    yearMonth,
    clienteNomes: asRecord(row?.clienteNomes),
    pdvPlacements: asPlacements(row?.pdvPlacements),
    hiddenClienteKeys: asStringArray(row?.hiddenClienteKeys),
    customClientes: asCustomClientes(row?.customClientes),
    acknowledgedPdvs: asStringArray(row?.acknowledgedPdvs),
  };
}

export async function saveProducaoLayout(
  yearMonth: number,
  patch: Partial<
    Pick<
      ProducaoLayoutPayload,
      | "clienteNomes"
      | "pdvPlacements"
      | "hiddenClienteKeys"
      | "customClientes"
      | "acknowledgedPdvs"
    >
  >,
): Promise<ProducaoLayoutPayload> {
  const current = await getProducaoLayout(yearMonth);
  const next = {
    clienteNomes: patch.clienteNomes ?? current.clienteNomes,
    pdvPlacements: patch.pdvPlacements ?? current.pdvPlacements,
    hiddenClienteKeys: patch.hiddenClienteKeys ?? current.hiddenClienteKeys,
    customClientes: patch.customClientes ?? current.customClientes,
    acknowledgedPdvs: patch.acknowledgedPdvs ?? current.acknowledgedPdvs,
  };
  await prisma.cadastroProducaoLayout.upsert({
    where: { yearMonth },
    create: { yearMonth, ...next },
    update: next,
  });
  return { yearMonth, ...next };
}
