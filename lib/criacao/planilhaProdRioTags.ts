import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import type { RioTagCobranca } from "@/lib/rio/rioTagCobranca";

/** Tag de cobrança Rio (Planilha Rio) por ref de cliente da produção. */
export async function loadPlanilhaProdRioTagByClienteRef(): Promise<Map<string, RioTagCobranca>> {
  const dash = await getProducaoDashboard();
  const map = new Map<string, RioTagCobranca>();
  for (const c of dash.clientes) {
    map.set(c.key, c.tagCobranca);
    if (c.rioLinhaId?.trim()) map.set(c.rioLinhaId.trim(), c.tagCobranca);
  }
  return map;
}

export function resolvePlanilhaProdLinkedRioTag(
  linkedClienteRef: string,
  tagByRef: Map<string, RioTagCobranca>,
): RioTagCobranca | null {
  const ref = linkedClienteRef.trim();
  if (!ref) return null;
  return tagByRef.get(ref) ?? null;
}
