import { listPrimeiroPingRows } from "@/lib/cadastros/primeiroPingService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import type { RioCompLinhaOut } from "@/lib/rio/rioClienteCompService";

export type RioCompLinhaEnriched = RioCompLinhaOut & {
  /** 1º ping quando o cliente Rio é também o PDV (sem filhos na planilha). */
  primeiroPingEm?: string | null;
};

function activePdvs<T extends { movimento?: string | null }>(pdvs: T[]): T[] {
  return pdvs.filter((p) => (p.movimento ?? "estavel") !== "saida");
}

function resolveLinhaPortalPdvId(
  ln: RioCompLinhaOut,
  portalByRioKey: Record<string, number>,
  portalClienteIdsByBucket: Record<string, number>,
): number | null {
  const fromKey = portalByRioKey[`linha:${ln.id}`];
  if (fromKey != null && fromKey > 0) return fromKey;

  const portalClienteId = ln.portalClienteId ?? portalClienteIdsByBucket[ln.id] ?? null;
  if (portalClienteId != null && portalClienteId > 0) {
    return proxyPortalPdvId(portalClienteId);
  }
  return null;
}

/** Anexa `primeiroPingEm` (ISO) em cada PDV e na linha (cliente=PDV) — só leitura. */
export async function enrichRioLinhasPrimeiroPing(
  linhas: RioCompLinhaOut[],
): Promise<RioCompLinhaEnriched[]> {
  if (linhas.length === 0) return linhas;

  const [pingRes, layout] = await Promise.all([
    listPrimeiroPingRows(),
    getProducaoCatalogLayout(),
  ]);
  if (!pingRes.ok) return linhas;

  const byPortalPdvId = new Map(pingRes.rows.map((r) => [r.pdvId, r.firstPingAt]));
  const portalByRioKey = layout.portalPdvIdsByRioPdvKey;
  const portalClienteIdsByBucket = layout.portalClienteIdsByBucketKey;

  return linhas.map((ln) => {
    const pdvs = ln.pdvs.map((p) => {
      const portalId =
        p.portalPdvId && p.portalPdvId > 0 ?
          p.portalPdvId
        : portalByRioKey[p.id] ?? portalByRioKey[`linha:${ln.id}`] ?? null;
      const primeiroPingEm =
        portalId != null ? (byPortalPdvId.get(portalId) ?? null) : null;
      return { ...p, primeiroPingEm };
    });

    let primeiroPingEm: string | null = null;
    if (activePdvs(pdvs).length === 0) {
      const portalPdvId = resolveLinhaPortalPdvId(ln, portalByRioKey, portalClienteIdsByBucket);
      if (portalPdvId != null) {
        primeiroPingEm = byPortalPdvId.get(portalPdvId) ?? null;
      }
    }

    return { ...ln, pdvs, primeiroPingEm };
  });
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
