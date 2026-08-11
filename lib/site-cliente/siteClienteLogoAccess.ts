import { prisma } from "@/lib/prisma";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";

/** Chaves de bucket (e legado rioLinhaId) visíveis no escopo do grupo. */
export async function loadGrupoScopeKeys(grupoId: string): Promise<Set<string>> {
  const g = await prisma.siteClienteGrupo.findUnique({
    where: { id: grupoId },
    include: { clientes: true, pdvs: true },
  });
  if (!g) return new Set();

  const keys = new Set<string>(g.clientes.map((c) => c.rioLinhaId));

  if (g.pdvs.length > 0) {
    const dash = await getProducaoDashboard();
    const pdvKeys = new Set(g.pdvs.map((p) => p.rioPdvKey));
    for (const bucket of dash.clientes) {
      if (bucket.pdvs.some((p) => pdvKeys.has(p.rioPdvKey))) {
        keys.add(bucket.key);
        if (bucket.rioLinhaId) keys.add(bucket.rioLinhaId);
      }
    }
  }

  return keys;
}
