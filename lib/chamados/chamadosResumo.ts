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
  let conversasNaoLidas = 0;
  let conversasMencoes = 0;
  for (const a of assuntos) {
    conversasNaoLidas += a.unreadGeneralCount;
    conversasMencoes += a.unreadMentionCount;
  }
  return { chamadosNaoLidos, conversasNaoLidas, conversasMencoes };
}
