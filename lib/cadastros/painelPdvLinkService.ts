import type { PainelMatchMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  resolvePainelPdvFromIds,
  suggestPainelMatches,
  type PainelMatchSuggestion,
} from "@/lib/cadastros/painelMatch";
import { csvGetPdvByPainelId } from "@/lib/radioPainel/exportClientesCsv";

export type VinculoRow = {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  rioPdvMovimento: string;
  clienteLinhaId: string;
  clienteNome: string;
  marcaNome: string | null;
  link: {
    id: string;
    painelPdvId: number;
    painelClienteId: number;
    matchMethod: PainelMatchMethod;
    painelPdvNome: string | null;
    painelClienteNome: string | null;
    verifiedAt: string | null;
  } | null;
};

export async function listVinculosForMonth(ym: number): Promise<{
  yearMonth: number;
  rows: VinculoRow[];
  stats: { total: number; linked: number; unlinked: number };
}> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          rioGrupo: { select: { nome: true } },
          pdvs: {
            orderBy: [{ sortOrder: "asc" }],
            include: { painelLink: true },
          },
        },
      },
    },
  });

  if (!month) {
    return { yearMonth: ym, rows: [], stats: { total: 0, linked: 0, unlinked: 0 } };
  }

  const rows: VinculoRow[] = [];
  for (const linha of month.linhas) {
    for (const pdv of linha.pdvs) {
      rows.push({
        rioPdvId: pdv.id,
        rioPdvNome: pdv.nome,
        rioDocumento: pdv.documento,
        rioPdvMovimento: pdv.movimento,
        clienteLinhaId: linha.id,
        clienteNome: linha.nomeFantasia || linha.razaoSocial,
        marcaNome: linha.rioGrupo?.nome ?? null,
        link:
          pdv.painelLink ?
            {
              id: pdv.painelLink.id,
              painelPdvId: pdv.painelLink.painelPdvId,
              painelClienteId: pdv.painelLink.painelClienteId,
              matchMethod: pdv.painelLink.matchMethod,
              painelPdvNome: pdv.painelLink.painelPdvNome,
              painelClienteNome: pdv.painelLink.painelClienteNome,
              verifiedAt: pdv.painelLink.verifiedAt?.toISOString() ?? null,
            }
          : null,
      });
    }
  }

  const linked = rows.filter((r) => r.link).length;
  return {
    yearMonth: ym,
    rows,
    stats: { total: rows.length, linked, unlinked: rows.length - linked },
  };
}

export async function suggestForRioPdv(rioCompPdvId: string): Promise<{
  rioPdvId: string;
  suggestions: PainelMatchSuggestion[];
}> {
  const pdv = await prisma.rioCompPdv.findUnique({
    where: { id: rioCompPdvId },
    include: {
      cliente: { select: { nomeFantasia: true, razaoSocial: true } },
    },
  });
  if (!pdv) throw new Error("rio_pdv_not_found");

  const suggestions = suggestPainelMatches({
    rioPdvNome: pdv.nome,
    rioDocumento: pdv.documento,
    rioClienteNome: pdv.cliente.nomeFantasia || pdv.cliente.razaoSocial,
  });

  return { rioPdvId: pdv.id, suggestions };
}

export async function upsertPainelPdvLink(input: {
  rioCompPdvId: string;
  painelPdvId: number;
  painelClienteId: number;
  matchMethod?: PainelMatchMethod;
  verified?: boolean;
}): Promise<Prisma.PainelPdvLinkGetPayload<object>> {
  const pdv = await prisma.rioCompPdv.findUnique({ where: { id: input.rioCompPdvId } });
  if (!pdv) throw new Error("rio_pdv_not_found");

  if (!Number.isFinite(input.painelPdvId) || input.painelPdvId <= 0) {
    throw new Error("painel_pdv_id_invalido");
  }
  if (!Number.isFinite(input.painelClienteId) || input.painelClienteId <= 0) {
    throw new Error("painel_cliente_id_invalido");
  }

  const rec =
    resolvePainelPdvFromIds(input.painelPdvId, input.painelClienteId) ??
    csvGetPdvByPainelId(String(input.painelPdvId));

  const method = input.matchMethod ?? "manual";
  const data = {
    painelPdvId: input.painelPdvId,
    painelClienteId: input.painelClienteId,
    matchMethod: method,
    painelPdvNome: rec?.pdvNome ?? null,
    painelClienteNome: rec?.nomeCliente ?? null,
    verifiedAt: input.verified ? new Date() : null,
  };

  return prisma.painelPdvLink.upsert({
    where: { rioCompPdvId: input.rioCompPdvId },
    create: { rioCompPdvId: input.rioCompPdvId, ...data },
    update: data,
  });
}

export async function deletePainelPdvLink(rioCompPdvId: string): Promise<void> {
  await prisma.painelPdvLink.deleteMany({ where: { rioCompPdvId } });
}

export function parseCadastrosYearMonth(raw: string): number | null {
  return parseYearMonthParam(raw);
}
