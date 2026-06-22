import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";

const CHUNK_SIZE = 250;

export type GatewayRegistryStatus = {
  ok: boolean;
  syncedPdvIds: Set<number>;
  syncedClienteIds: Set<number>;
  error?: string;
};

/** IDs presentes no gateway cloud2 (tabelas clientes/pdvs). */
export async function loadGatewayRegistryStatus(
  pdvIds: number[],
  clienteIds: number[] = [],
): Promise<GatewayRegistryStatus> {
  const pdvs = [...new Set(pdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  const clientes = [...new Set(clienteIds.filter((id) => Number.isFinite(id) && id > 0))];

  if ((pdvs.length === 0 && clientes.length === 0) || !cloud2Enabled()) {
    return { ok: false, syncedPdvIds: new Set(), syncedClienteIds: new Set(), error: "cloud2_desabilitado" };
  }

  const syncedPdvIds = new Set<number>();
  const syncedClienteIds = new Set<number>();
  let anyOk = false;

  for (let i = 0; i < pdvs.length; i += CHUNK_SIZE) {
    const pdvChunk = pdvs.slice(i, i + CHUNK_SIZE);
    const res = await cloud2FetchWithTimeout(
      "/player/registry-check",
      {
        method: "POST",
        body: JSON.stringify({ pdvIds: pdvChunk, clienteIds: [] }),
      },
      15_000,
    );
    if (!res) continue;
    anyOk = true;
    const data = await parseCloud2Json<{
      ok?: boolean;
      syncedPdvIds?: number[];
    }>(res, "registry_check");
    if (!res.ok || !data.ok) continue;
    for (const id of data.syncedPdvIds ?? []) syncedPdvIds.add(id);
  }

  for (let i = 0; i < clientes.length; i += CHUNK_SIZE) {
    const clienteChunk = clientes.slice(i, i + CHUNK_SIZE);
    const res = await cloud2FetchWithTimeout(
      "/player/registry-check",
      {
        method: "POST",
        body: JSON.stringify({ pdvIds: [], clienteIds: clienteChunk }),
      },
      15_000,
    );
    if (!res) continue;
    anyOk = true;
    const data = await parseCloud2Json<{
      ok?: boolean;
      syncedClienteIds?: number[];
    }>(res, "registry_check");
    if (!res.ok || !data.ok) continue;
    for (const id of data.syncedClienteIds ?? []) syncedClienteIds.add(id);
  }

  return { ok: anyOk, syncedPdvIds, syncedClienteIds };
}

export function isPdvSyncedOnGateway(
  portalPdvId: number | null | undefined,
  portalClienteId: number | null | undefined,
  status: GatewayRegistryStatus,
): boolean {
  if (!portalPdvId || portalPdvId <= 0) return false;
  if (!status.syncedPdvIds.has(portalPdvId)) return false;
  if (portalClienteId && portalClienteId > 0 && !status.syncedClienteIds.has(portalClienteId)) {
    return false;
  }
  return true;
}
