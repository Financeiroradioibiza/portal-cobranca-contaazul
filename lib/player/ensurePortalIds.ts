import { prisma } from "@/lib/prisma";
import {
  buildPortalPdvId,
  PORTAL_CLIENTE_ID_START,
  portalPdvSeqFromPdvId,
} from "@/lib/player/portalPlayerIds";

/** Atribui portalClienteId ao próximo disponível (100+) — só se ainda não tiver. */
export async function ensurePortalClienteIdForLinha(linhaId: string): Promise<number> {
  const linha = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linhaId },
    select: { portalClienteId: true },
  });
  if (!linha) throw new Error("linha_not_found");
  if (linha.portalClienteId != null) return linha.portalClienteId;

  const max = await prisma.rioCompClienteLinha.aggregate({ _max: { portalClienteId: true } });
  const next = Math.max(PORTAL_CLIENTE_ID_START - 1, max._max.portalClienteId ?? 0) + 1;
  await prisma.rioCompClienteLinha.update({
    where: { id: linhaId },
    data: { portalClienteId: next },
  });
  return next;
}

/** Atribui portalPdvId (100.001…) — só se ainda não tiver. */
export async function ensurePortalPdvIdForPdv(pdvId: string): Promise<number> {
  const pdv = await prisma.rioCompPdv.findUnique({
    where: { id: pdvId },
    select: {
      portalPdvId: true,
      clienteId: true,
      cliente: { select: { portalClienteId: true } },
    },
  });
  if (!pdv) throw new Error("pdv_not_found");
  if (pdv.portalPdvId != null) return pdv.portalPdvId;

  const portalClienteId =
    pdv.cliente.portalClienteId ?? (await ensurePortalClienteIdForLinha(pdv.clienteId));

  const siblings = await prisma.rioCompPdv.findMany({
    where: { clienteId: pdv.clienteId, portalPdvId: { not: null } },
    select: { portalPdvId: true },
  });
  const maxSeq = siblings.reduce(
    (m, s) => Math.max(m, portalPdvSeqFromPdvId(s.portalPdvId!)),
    0,
  );
  const portalPdvId = buildPortalPdvId(portalClienteId, maxSeq + 1);
  await prisma.rioCompPdv.update({
    where: { id: pdvId },
    data: { portalPdvId },
  });
  return portalPdvId;
}
