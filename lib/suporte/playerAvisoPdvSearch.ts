import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { listPortalPlayerRows } from "@/lib/player/listPortalPlayerRows";

export type PlayerAvisoPdvTarget = {
  portalClienteId: number;
  portalPdvId: number;
  codigoDisplay: string;
  clienteNome: string;
  pdvNome: string;
};

function matchesQuery(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return words.every((w) => h.includes(w));
}

/** PDVs com ID Player — busca por nome de cliente, PDV ou código (100.001). */
export async function searchPlayerAvisoPdvTargets(
  query: string,
  limit = 25,
): Promise<PlayerAvisoPdvTarget[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const { rows } = await listPortalPlayerRows();
  const out: PlayerAvisoPdvTarget[] = [];

  for (const r of rows) {
    const link = r.portalPlayerId;
    if (!link) continue;

    const codigo = formatPortalPdvIdDisplay(link.portalPdvId);
    const hay = [
      r.clienteNome,
      r.rioPdvNome,
      r.rioLinhaNome,
      r.marcaNome ?? "",
      codigo,
      String(link.portalClienteId),
      String(link.portalPdvId),
    ].join(" ");

    if (!matchesQuery(hay, q)) continue;

    out.push({
      portalClienteId: link.portalClienteId,
      portalPdvId: link.portalPdvId,
      codigoDisplay: codigo,
      clienteNome: r.clienteNome.trim() || "Cliente",
      pdvNome: r.rioPdvNome.trim() || codigo,
    });
    if (out.length >= limit) break;
  }

  return out;
}

export async function resolvePlayerAvisoPdvLabels(
  pairs: Array<{ portalClienteId: number; portalPdvId: number }>,
): Promise<Map<number, { clienteNome: string; pdvNome: string; codigoDisplay: string }>> {
  const wanted = new Set(pairs.map((p) => p.portalPdvId));
  if (wanted.size === 0) return new Map();

  const { rows } = await listPortalPlayerRows();
  const map = new Map<number, { clienteNome: string; pdvNome: string; codigoDisplay: string }>();

  for (const r of rows) {
    const link = r.portalPlayerId;
    if (!link || !wanted.has(link.portalPdvId)) continue;
    map.set(link.portalPdvId, {
      clienteNome: r.clienteNome.trim() || "Cliente",
      pdvNome: r.rioPdvNome.trim() || formatPortalPdvIdDisplay(link.portalPdvId),
      codigoDisplay: formatPortalPdvIdDisplay(link.portalPdvId),
    });
  }

  return map;
}
