import type { PainelMatchMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  BULK_BATCH_SIZE,
  BULK_SUGGEST_MIN_SCORE,
  filterSuggestionsForBulk,
  resolvePainelPdvFromIds,
  suggestPainelMatches,
  type PainelMatchSuggestion,
} from "@/lib/cadastros/painelMatch";
import { importProducaoCadastroFromPainel } from "@/lib/cadastros/painelPdvCadastroImport";
import { csvGetPdvByPainelId } from "@/lib/radioPainel/exportClientesCsv";

export type PainelPdvLinkConflict = {
  painelPdvId: number;
  existingRioCompPdvId: string;
  existingRioPdvNome: string;
  painelPdvNome: string | null;
};

export async function findPainelPdvLinkConflict(
  painelPdvId: number,
  exceptRioCompPdvId: string,
): Promise<PainelPdvLinkConflict | null> {
  const existing = await prisma.painelPdvLink.findFirst({
    where: {
      painelPdvId,
      rioCompPdvId: { not: exceptRioCompPdvId },
    },
    include: {
      rioCompPdv: { select: { id: true, nome: true } },
    },
  });
  if (!existing) return null;
  return {
    painelPdvId: existing.painelPdvId,
    existingRioCompPdvId: existing.rioCompPdv.id,
    existingRioPdvNome: existing.rioCompPdv.nome,
    painelPdvNome: existing.painelPdvNome,
  };
}

async function loadPainelPdvTakenPairs(): Promise<
  Array<{ painelPdvId: number; rioCompPdvId: string }>
> {
  return prisma.painelPdvLink.findMany({
    select: { painelPdvId: true, rioCompPdvId: true },
  });
}

function takenPainelIdsForRio(
  pairs: Array<{ painelPdvId: number; rioCompPdvId: string }>,
  rioCompPdvId: string,
): Set<number> {
  const taken = new Set<number>();
  for (const p of pairs) {
    if (p.rioCompPdvId !== rioCompPdvId) taken.add(p.painelPdvId);
  }
  return taken;
}

function filterAvailableSuggestions(
  suggestions: PainelMatchSuggestion[],
  takenPainelIds: Set<number>,
): PainelMatchSuggestion[] {
  return suggestions.filter((s) => !takenPainelIds.has(s.painelPdvId));
}

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

  const takenPairs = await loadPainelPdvTakenPairs();
  const suggestions = filterAvailableSuggestions(
    suggestPainelMatches({
      rioPdvNome: pdv.nome,
      rioDocumento: pdv.documento,
      rioClienteNome: pdv.cliente.nomeFantasia || pdv.cliente.razaoSocial,
    }),
    takenPainelIdsForRio(takenPairs, pdv.id),
  );

  return { rioPdvId: pdv.id, suggestions };
}

export async function upsertPainelPdvLink(input: {
  rioCompPdvId: string;
  painelPdvId: number;
  painelClienteId: number;
  matchMethod?: PainelMatchMethod;
  verified?: boolean;
  cadastroCsvOnly?: boolean;
}): Promise<{
  link: Prisma.PainelPdvLinkGetPayload<object>;
  cadastroImport: Awaited<ReturnType<typeof importProducaoCadastroFromPainel>>;
}> {
  const pdv = await prisma.rioCompPdv.findUnique({ where: { id: input.rioCompPdvId } });
  if (!pdv) throw new Error("rio_pdv_not_found");

  if (!Number.isFinite(input.painelPdvId) || input.painelPdvId <= 0) {
    throw new Error("painel_pdv_id_invalido");
  }
  if (!Number.isFinite(input.painelClienteId) || input.painelClienteId <= 0) {
    throw new Error("painel_cliente_id_invalido");
  }

  const conflict = await findPainelPdvLinkConflict(
    input.painelPdvId,
    input.rioCompPdvId,
  );
  if (conflict) {
    const err = new Error("painel_pdv_ja_vinculado") as Error & {
      conflict?: PainelPdvLinkConflict;
    };
    err.conflict = conflict;
    throw err;
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

  const link = await prisma.painelPdvLink.upsert({
    where: { rioCompPdvId: input.rioCompPdvId },
    create: { rioCompPdvId: input.rioCompPdvId, ...data },
    update: data,
  });

  const cadastroImport = await importProducaoCadastroFromPainel(
    input.rioCompPdvId,
    input.painelPdvId,
    input.painelClienteId,
    input.cadastroCsvOnly ? { csvOnly: true, refreshCobranca: false } : undefined,
  );

  return { link, cadastroImport };
}

export async function deletePainelPdvLink(rioCompPdvId: string): Promise<void> {
  await prisma.painelPdvLink.deleteMany({ where: { rioCompPdvId } });
}

export type BulkSuggestItem = {
  rioPdvId: string;
  rioPdvNome: string;
  rioDocumento: string | null;
  clienteNome: string;
  marcaNome: string | null;
  suggestion: PainelMatchSuggestion;
  alternatives: PainelMatchSuggestion[];
};

export async function suggestBulkForRioPdvs(
  rioCompPdvIds: string[],
  opts?: { minScore?: number },
): Promise<BulkSuggestItem[]> {
  if (rioCompPdvIds.length > BULK_BATCH_SIZE) {
    throw new Error("batch_limit_10");
  }
  if (rioCompPdvIds.length === 0) return [];

  const minScore = opts?.minScore ?? BULK_SUGGEST_MIN_SCORE;

  const pdvs = await prisma.rioCompPdv.findMany({
    where: { id: { in: rioCompPdvIds } },
    include: {
      cliente: {
        select: { nomeFantasia: true, razaoSocial: true, rioGrupo: { select: { nome: true } } },
      },
    },
  });
  const byId = new Map(pdvs.map((p) => [p.id, p]));
  const takenPairs = await loadPainelPdvTakenPairs();

  const items: BulkSuggestItem[] = [];
  for (const id of rioCompPdvIds) {
    const pdv = byId.get(id);
    if (!pdv) continue;

    const all = filterAvailableSuggestions(
      suggestPainelMatches({
        rioPdvNome: pdv.nome,
        rioDocumento: pdv.documento,
        rioClienteNome: pdv.cliente.nomeFantasia || pdv.cliente.razaoSocial,
      }),
      takenPainelIdsForRio(takenPairs, id),
    );
    const filtered =
      minScore > 0 ? filterSuggestionsForBulk(all, minScore) : (
        [...all].sort((a, b) => b.score - a.score)
      );
    if (filtered.length === 0) continue;

    const [best, ...rest] = filtered;
    items.push({
      rioPdvId: pdv.id,
      rioPdvNome: pdv.nome,
      rioDocumento: pdv.documento,
      clienteNome: pdv.cliente.nomeFantasia || pdv.cliente.razaoSocial,
      marcaNome: pdv.cliente.rioGrupo?.nome ?? null,
      suggestion: best,
      alternatives: rest,
    });
  }

  return items;
}

export type BulkLinkInput = {
  rioCompPdvId: string;
  painelPdvId: number;
  painelClienteId: number;
  matchMethod?: PainelMatchMethod;
};

export async function upsertPainelPdvLinksBulk(links: BulkLinkInput[]): Promise<{
  linked: number;
  cadastroImported: number;
  failed: Array<{ rioCompPdvId: string; error: string }>;
}> {
  if (links.length > BULK_BATCH_SIZE) throw new Error("batch_limit_10");

  let linked = 0;
  let cadastroImported = 0;
  const failed: Array<{ rioCompPdvId: string; error: string }> = [];

  for (const item of links) {
    try {
      const { cadastroImport } = await upsertPainelPdvLink({
        ...item,
        verified: true,
        cadastroCsvOnly: true,
      });
      linked += 1;
      if (cadastroImport.imported) cadastroImported += 1;
    } catch (e) {
      failed.push({
        rioCompPdvId: item.rioCompPdvId,
        error: e instanceof Error ? e.message : "erro",
      });
    }
  }

  return { linked, cadastroImported, failed };
}

export function parseCadastrosYearMonth(raw: string): number | null {
  return parseYearMonthParam(raw);
}
