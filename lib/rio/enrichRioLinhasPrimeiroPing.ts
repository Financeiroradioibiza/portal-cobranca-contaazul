import { listPrimeiroPingRows } from "@/lib/cadastros/primeiroPingService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import type { RioCompLinhaOut } from "@/lib/rio/rioClienteCompService";

/** Anexa `primeiroPingEm` (ISO) em cada PDV — só leitura; não altera registro de primeiro ping. */
export async function enrichRioLinhasPrimeiroPing(
  linhas: RioCompLinhaOut[],
): Promise<RioCompLinhaOut[]> {
  if (linhas.length === 0) return linhas;

  const [pingRes, layout] = await Promise.all([
    listPrimeiroPingRows(),
    getProducaoCatalogLayout(),
  ]);
  if (!pingRes.ok) return linhas;

  const byPortalPdvId = new Map(pingRes.rows.map((r) => [r.pdvId, r.firstPingAt]));
  const portalByRioKey = layout.portalPdvIdsByRioPdvKey;

  return linhas.map((ln) => ({
    ...ln,
    pdvs: ln.pdvs.map((p) => {
      const portalId =
        p.portalPdvId && p.portalPdvId > 0 ?
          p.portalPdvId
        : portalByRioKey[p.id] ?? portalByRioKey[`linha:${ln.id}`] ?? null;
      const primeiroPingEm =
        portalId != null ? (byPortalPdvId.get(portalId) ?? null) : null;
      return { ...p, primeiroPingEm };
    }),
  }));
}

export function formatRioPrimeiroPing(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}
