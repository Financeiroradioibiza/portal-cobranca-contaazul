import { prisma } from "@/lib/prisma";
import { parseSiteClienteGrupoTipo } from "@/lib/site-cliente/grupoTipo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

/** Tokens antigos podem não ter gtipo no JWT — resolve pelo banco. */
export async function enrichSiteClienteSessionGrupoTipo(
  session: SiteClienteSessionPayload,
): Promise<SiteClienteSessionPayload> {
  const grupo = await prisma.siteClienteGrupo.findUnique({
    where: { id: session.grupoId },
    select: { tipo: true },
  });
  const grupoTipo = parseSiteClienteGrupoTipo(grupo?.tipo);
  if (grupoTipo === session.grupoTipo) return session;
  return { ...session, grupoTipo };
}
