import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { listRioCompMonths } from "@/lib/rio/rioClienteCompService";
import { isSiteClienteCaPersonIdLinkable } from "@/lib/site-cliente/grupoTipo";

export type SiteClienteCobrancaCatalogItem = {
  caPersonId: string;
  documento: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  emailCobranca: string | null;
  rioLinhaId: string;
  competenciaYm: number;
  label: string;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function labelForLinha(input: {
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
}): string {
  const nome = input.nomeFantasia.trim() || input.razaoSocial.trim() || "Cliente";
  const doc = input.documento?.trim();
  return doc ? `${nome} · ${doc}` : nome;
}

function buildSearchWhere(query: string): Prisma.RioCompClienteLinhaWhereInput[] {
  const q = query.trim();
  const qDigits = digitsOnly(q);
  const or: Prisma.RioCompClienteLinhaWhereInput[] = [
    { nomeFantasia: { contains: q, mode: "insensitive" } },
    { razaoSocial: { contains: q, mode: "insensitive" } },
    { emailCobranca: { contains: q, mode: "insensitive" } },
    { documento: { contains: q, mode: "insensitive" } },
    { grupoSite: { contains: q, mode: "insensitive" } },
  ];
  if (qDigits.length >= 4) {
    or.push({ documento: { contains: qDigits } });
  }
  return or;
}

/** Busca unidades de cobrança na competência Rio mais recente (filtro no banco, não só nas 500 primeiras linhas). */
export async function searchSiteClienteCobrancaCatalog(
  query: string,
  limit = 30,
): Promise<{ clientes: SiteClienteCobrancaCatalogItem[]; competenciaYm: number | null }> {
  const q = query.trim();
  if (q.length < 2) return { clientes: [], competenciaYm: null };

  const months = await listRioCompMonths();
  const latest = months[0];
  if (!latest) return { clientes: [], competenciaYm: null };

  const cap = Math.min(Math.max(limit, 1), 50);

  const linhas = await prisma.rioCompClienteLinha.findMany({
    where: {
      monthId: latest.id,
      OR: buildSearchWhere(q),
    },
    select: {
      id: true,
      caPersonId: true,
      documento: true,
      razaoSocial: true,
      nomeFantasia: true,
      emailCobranca: true,
    },
    orderBy: [{ nomeFantasia: "asc" }, { razaoSocial: "asc" }],
    take: cap * 4,
  });

  const out: SiteClienteCobrancaCatalogItem[] = [];

  for (const l of linhas) {
    if (!isSiteClienteCaPersonIdLinkable(l.caPersonId)) continue;
    out.push({
      caPersonId: l.caPersonId.trim(),
      documento: l.documento,
      razaoSocial: l.razaoSocial,
      nomeFantasia: l.nomeFantasia,
      emailCobranca: l.emailCobranca,
      rioLinhaId: l.id,
      competenciaYm: latest.yearMonth,
      label: labelForLinha(l),
    });
    if (out.length >= cap) break;
  }

  return { clientes: out, competenciaYm: latest.yearMonth };
}
