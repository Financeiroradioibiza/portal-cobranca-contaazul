import "server-only";

import { totalChamadoInboxUnread } from "@/lib/chamados/chamadoInboxService";
import type { ChamadosResumoView } from "@/lib/chamados/chamadoTypes";
import { listConversaAssuntos } from "@/lib/chamados/conversaService";

export type { ChamadosResumoView };

export async function getChamadosResumoForUser(userEmail: string): Promise<ChamadosResumoView> {
  const [chamadosNaoLidos, assuntos] = await Promise.all([
    totalChamadoInboxUnread(userEmail),
    listConversaAssuntos(userEmail),
  ]);
  const conversasNaoLidas = assuntos.reduce((n, a) => n + a.unreadCount, 0);
  const conversasMencoes = assuntos.filter((a) => a.mentionUnread).length;
  return { chamadosNaoLidos, conversasNaoLidas, conversasMencoes };
}
