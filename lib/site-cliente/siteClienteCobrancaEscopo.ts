import { prisma } from "@/lib/prisma";
import { isSiteClienteCaPersonIdLinkable } from "@/lib/site-cliente/grupoTipo";

export type SiteClienteCobrancaEscopoCliente = {
  caPersonId: string;
  documento: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  emailCobranca: string | null;
  rioLinhaId: string | null;
};

export type SiteClienteCobrancaEscopo = {
  caPersonIds: Set<string>;
  byCaPersonId: Map<string, SiteClienteCobrancaEscopoCliente>;
};

/** Unidades Conta Azul vinculadas ao grupo cobrança (escopo obrigatório). */
export async function loadSiteClienteCobrancaEscopo(
  grupoId: string,
): Promise<SiteClienteCobrancaEscopo> {
  const rows = await prisma.siteClienteGrupoCaCliente.findMany({
    where: { grupoId },
    select: {
      caPersonId: true,
      documento: true,
      razaoSocial: true,
      nomeFantasia: true,
      emailCobranca: true,
      rioLinhaId: true,
    },
  });

  const caPersonIds = new Set<string>();
  const byCaPersonId = new Map<string, SiteClienteCobrancaEscopoCliente>();

  for (const row of rows) {
    const caPersonId = row.caPersonId.trim();
    if (!isSiteClienteCaPersonIdLinkable(caPersonId)) continue;
    caPersonIds.add(caPersonId);
    byCaPersonId.set(caPersonId, {
      caPersonId,
      documento: row.documento,
      razaoSocial: row.razaoSocial,
      nomeFantasia: row.nomeFantasia,
      emailCobranca: row.emailCobranca,
      rioLinhaId: row.rioLinhaId,
    });
  }

  return { caPersonIds, byCaPersonId };
}
