import { prisma } from "@/lib/prisma";
import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import {
  type PortalPlayerIdBrief,
  proxyPortalPdvId,
} from "@/lib/player/portalPlayerIds";

export type PortalPlayerIdMaps = {
  byRioPdvKey: Map<string, PortalPlayerIdBrief>;
  clienteIdByLinhaId: Map<string, number>;
};

/** Carrega IDs do Player a partir da Planilha Rio (sem painel legado). */
export async function loadPortalPlayerIdMaps(rioPdvKeys: string[]): Promise<PortalPlayerIdMaps> {
  const byRioPdvKey = new Map<string, PortalPlayerIdBrief>();
  const clienteIdByLinhaId = new Map<string, number>();

  const realPdvIds = rioPdvKeys.filter((k) => !k.startsWith("linha:"));
  const linhaProxyKeys = rioPdvKeys.filter((k) => k.startsWith("linha:"));

  if (realPdvIds.length > 0) {
    const pdvs = await prisma.rioCompPdv.findMany({
      where: { id: { in: realPdvIds } },
      select: {
        id: true,
        portalPdvId: true,
        cliente: { select: { id: true, portalClienteId: true } },
      },
    });
    for (const p of pdvs) {
      const portalClienteId = p.cliente.portalClienteId;
      if (portalClienteId == null || p.portalPdvId == null) continue;
      clienteIdByLinhaId.set(p.cliente.id, portalClienteId);
      byRioPdvKey.set(p.id, { portalClienteId, portalPdvId: p.portalPdvId });
    }
  }

  if (linhaProxyKeys.length > 0) {
    const linhaIds = linhaProxyKeys.map((k) => k.slice("linha:".length)).filter(Boolean);
    const linhas = await prisma.rioCompClienteLinha.findMany({
      where: { id: { in: linhaIds } },
      select: { id: true, portalClienteId: true },
    });
    for (const ln of linhas) {
      if (ln.portalClienteId == null) continue;
      clienteIdByLinhaId.set(ln.id, ln.portalClienteId);
      byRioPdvKey.set(linhaAsPdvKey(ln.id), {
        portalClienteId: ln.portalClienteId,
        portalPdvId: proxyPortalPdvId(ln.portalClienteId),
      });
    }
  }

  return { byRioPdvKey, clienteIdByLinhaId };
}
