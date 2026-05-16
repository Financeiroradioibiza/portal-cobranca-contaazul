import { prisma } from "@/lib/prisma";
import type { ClientRow } from "@/lib/types";

/**
 * Anexa observação persistida e remove registros de clientes que saíram da listagem
 * (sem parcelas vencidas em aberto neste recorte).
 */
export async function attachClientPortalMeta(clients: ClientRow[]): Promise<ClientRow[]> {
  const ids = [...new Set(clients.map((c) => c.id).filter(Boolean))];

  if (ids.length === 0) {
    await prisma.clientPortalMeta.deleteMany({});
    return [];
  }

  await prisma.clientPortalMeta.deleteMany({
    where: { clientId: { notIn: ids } },
  });

  const rows = await prisma.clientPortalMeta.findMany({
    where: { clientId: { in: ids } },
  });
  const byId = new Map(rows.map((r) => [r.clientId, r]));

  return clients.map((c) => {
    const m = byId.get(c.id);
    return {
      ...c,
      note: m?.note ?? "",
    };
  });
}
