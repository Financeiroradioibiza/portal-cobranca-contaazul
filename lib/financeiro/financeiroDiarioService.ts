import { prisma } from "@/lib/prisma";
import { addDaysYmd } from "@/lib/financeiro/financeiroOverviewDates";
import type { Prisma } from "@prisma/client";

export type FinanceiroDiarioEscopo = "cliente" | "pdv";

export type FinanceiroDiarioEntryRow = {
  id: string;
  escopo: FinanceiroDiarioEscopo;
  portalClienteId: number | null;
  portalPdvId: number | null;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  texto: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: string;
};

export type FinanceiroDiarioSortField =
  | "createdAt"
  | "clienteNome"
  | "pdvNome"
  | "criadoPorNome"
  | "texto";

export type ListFinanceiroDiarioParams = {
  dataDe?: string;
  dataAte?: string;
  cliente?: string;
  pdv?: string;
  texto?: string;
  usuario?: string;
  sort?: FinanceiroDiarioSortField;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type CreateFinanceiroDiarioInput = {
  escopo: FinanceiroDiarioEscopo;
  portalClienteId: number;
  portalPdvId?: number | null;
  clienteNome: string;
  pdvNome?: string;
  codigoDisplay?: string;
  texto: string;
  criadoPorEmail: string;
  criadoPorNome: string;
};

function brYmdToUtcRange(de?: string, ate?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (de?.trim()) {
    range.gte = new Date(`${de.trim()}T00:00:00-03:00`);
  }
  if (ate?.trim()) {
    const next = addDaysYmd(ate.trim(), 1);
    range.lt = new Date(`${next}T00:00:00-03:00`);
  }
  return range;
}

function mapRow(row: {
  id: string;
  escopo: string;
  portalClienteId: number | null;
  portalPdvId: number | null;
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  texto: string;
  criadoPorEmail: string;
  criadoPorNome: string;
  createdAt: Date;
}): FinanceiroDiarioEntryRow {
  return {
    id: row.id,
    escopo: row.escopo === "cliente" ? "cliente" : "pdv",
    portalClienteId: row.portalClienteId,
    portalPdvId: row.portalPdvId,
    clienteNome: row.clienteNome,
    pdvNome: row.pdvNome,
    codigoDisplay: row.codigoDisplay,
    texto: row.texto,
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhere(params: ListFinanceiroDiarioParams): Prisma.FinanceiroDiarioEntryWhereInput {
  const and: Prisma.FinanceiroDiarioEntryWhereInput[] = [];
  const createdAt = brYmdToUtcRange(params.dataDe, params.dataAte);
  if (createdAt.gte != null || createdAt.lt != null) {
    and.push({ createdAt });
  }

  const clienteQ = params.cliente?.trim();
  if (clienteQ) {
    and.push({
      OR: [
        { clienteNome: { contains: clienteQ, mode: "insensitive" } },
        ...( /^\d+$/.test(clienteQ) ? [{ portalClienteId: Number(clienteQ) }] : []),
      ],
    });
  }

  const pdvQ = params.pdv?.trim();
  if (pdvQ) {
    const pdvOr: Prisma.FinanceiroDiarioEntryWhereInput[] = [
      { pdvNome: { contains: pdvQ, mode: "insensitive" } },
      { codigoDisplay: { contains: pdvQ, mode: "insensitive" } },
    ];
    if (/^\d+(\.\d+)?$/.test(pdvQ.replace(",", "."))) {
      pdvOr.push({ codigoDisplay: { contains: pdvQ.replace(",", "."), mode: "insensitive" } });
    }
    and.push({ OR: pdvOr });
  }

  const textoQ = params.texto?.trim();
  if (textoQ) {
    and.push({ texto: { contains: textoQ, mode: "insensitive" } });
  }

  const usuarioQ = params.usuario?.trim();
  if (usuarioQ) {
    and.push({
      OR: [
        { criadoPorNome: { contains: usuarioQ, mode: "insensitive" } },
        { criadoPorEmail: { contains: usuarioQ, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function sortField(params: ListFinanceiroDiarioParams): Prisma.FinanceiroDiarioEntryOrderByWithRelationInput {
  const order = params.order === "asc" ? "asc" : "desc";
  switch (params.sort) {
    case "clienteNome":
      return { clienteNome: order };
    case "pdvNome":
      return { pdvNome: order };
    case "criadoPorNome":
      return { criadoPorNome: order };
    case "texto":
      return { texto: order };
    default:
      return { createdAt: order };
  }
}

export async function listFinanceiroDiarioEntries(
  params: ListFinanceiroDiarioParams,
): Promise<{ rows: FinanceiroDiarioEntryRow[]; total: number }> {
  const where = buildWhere(params);
  const take = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const skip = Math.max(params.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    prisma.financeiroDiarioEntry.findMany({
      where,
      orderBy: sortField(params),
      take,
      skip,
    }),
    prisma.financeiroDiarioEntry.count({ where }),
  ]);

  return { rows: rows.map(mapRow), total };
}

export async function listFinanceiroDiarioUsuarios(): Promise<string[]> {
  const rows = await prisma.financeiroDiarioEntry.findMany({
    distinct: ["criadoPorNome"],
    select: { criadoPorNome: true },
    orderBy: { criadoPorNome: "asc" },
    take: 100,
  });
  return rows.map((r) => r.criadoPorNome.trim()).filter(Boolean);
}

export async function createFinanceiroDiarioEntry(
  input: CreateFinanceiroDiarioInput,
): Promise<FinanceiroDiarioEntryRow> {
  const texto = input.texto.trim();
  if (!texto) throw new Error("texto_vazio");

  const escopo = input.escopo === "cliente" ? "cliente" : "pdv";
  if (!Number.isFinite(input.portalClienteId) || input.portalClienteId <= 0) {
    throw new Error("cliente_invalido");
  }
  if (escopo === "pdv") {
    if (input.portalPdvId == null || !Number.isFinite(input.portalPdvId) || input.portalPdvId <= 0) {
      throw new Error("pdv_invalido");
    }
  }

  const row = await prisma.financeiroDiarioEntry.create({
    data: {
      escopo,
      portalClienteId: input.portalClienteId,
      portalPdvId: escopo === "pdv" ? input.portalPdvId! : null,
      clienteNome: input.clienteNome.trim() || "Cliente",
      pdvNome: escopo === "pdv" ? (input.pdvNome?.trim() || "") : "",
      codigoDisplay: escopo === "pdv" ? (input.codigoDisplay?.trim() || "") : "",
      texto,
      criadoPorEmail: input.criadoPorEmail.trim(),
      criadoPorNome: input.criadoPorNome.trim() || input.criadoPorEmail.trim(),
    },
  });

  return mapRow(row);
}
