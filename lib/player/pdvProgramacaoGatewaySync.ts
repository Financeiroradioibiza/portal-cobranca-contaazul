import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";
import { syncPlayerGatewayRegistryForPdvIds } from "@/lib/player/playerGatewaySync";
import { signalPlayerProgramacaoUpdate } from "@/lib/player/signalPlayerProgramacaoUpdate";

export type PdvGatewayProgramacaoStatus = {
  portalPdvId: number;
  synced: boolean;
  programaId: number | null;
  origemProgramacaoId: string | null;
  programaNome: string | null;
  atualizacaoPendente: boolean;
};

export type SyncPdvProgramacaoResult = {
  sync: { clientes: number; pdvs: number };
  gateway: PdvGatewayProgramacaoStatus;
  signalPdvs: number;
};

/** Lê programa amarrado no gateway (cloud2) para validar sync. */
export async function fetchPdvGatewayProgramacaoStatus(
  portalPdvIds: number[],
): Promise<PdvGatewayProgramacaoStatus[]> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");
  const ids = [...new Set(portalPdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return [];

  const res = await cloud2FetchWithTimeout(
    "/player/registry-check",
    {
      method: "POST",
      body: JSON.stringify({ pdvIds: ids, details: true }),
    },
    20_000,
  );
  const data = await parseCloud2Json<{
    ok?: boolean;
    pdvDetails?: Array<{
      id: number;
      programaId: number | null;
      origemProgramacaoId: string | null;
      programaNome: string | null;
      atualizacaoPendente: string | null;
    }>;
  }>(res, "registry_check");

  const byId = new Map(
    (data.pdvDetails ?? []).map((row) => [
      row.id,
      {
        portalPdvId: row.id,
        synced: true,
        programaId: row.programaId,
        origemProgramacaoId: row.origemProgramacaoId,
        programaNome: row.programaNome,
        atualizacaoPendente: row.atualizacaoPendente === "S",
      } satisfies PdvGatewayProgramacaoStatus,
    ]),
  );

  return ids.map(
    (id) =>
      byId.get(id) ?? {
        portalPdvId: id,
        synced: false,
        programaId: null,
        origemProgramacaoId: null,
        programaNome: null,
        atualizacaoPendente: false,
      },
  );
}

function assertGatewayMatchesAssignment(
  status: PdvGatewayProgramacaoStatus,
  expectedProgramacaoPortalId: string | null,
): void {
  if (!status.synced) throw new Error("pdv_nao_sincronizado_gateway");

  if (expectedProgramacaoPortalId) {
    if (status.origemProgramacaoId !== expectedProgramacaoPortalId) {
      if (!status.origemProgramacaoId && !status.programaId) {
        throw new Error("programacao_nao_publicada_no_gateway");
      }
      throw new Error("programa_gateway_desalinhado");
    }
    return;
  }

  if (status.programaId != null) {
    throw new Error("programa_gateway_deveria_estar_vazio");
  }
}

/**
 * Sync portal → cloud2 + verifica amarração + sinaliza player.
 * Falha explícita se o gateway não refletir a programação esperada.
 */
export async function syncPdvProgramacaoToGateway(options: {
  portalClienteId: number;
  portalPdvId: number;
  expectedProgramacaoPortalId: string | null;
}): Promise<SyncPdvProgramacaoResult> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");

  const sync = await syncPlayerGatewayRegistryForPdvIds([options.portalPdvId]);
  if (sync.pdvs === 0) throw new Error("sync_nenhum_pdv");

  const [gateway] = await fetchPdvGatewayProgramacaoStatus([options.portalPdvId]);
  assertGatewayMatchesAssignment(gateway, options.expectedProgramacaoPortalId);

  const signal = await signalPlayerProgramacaoUpdate(options.portalClienteId, [options.portalPdvId]);

  return { sync, gateway, signalPdvs: signal.pdvs };
}

/** Sync + verify para vários PDVs amarrados à mesma programação (disparo/publicar). */
export async function syncProgramacaoPdvsToGateway(options: {
  portalClienteId: number;
  portalPdvIds: number[];
  programacaoPortalId: string;
}): Promise<{ sync: { clientes: number; pdvs: number }; mismatches: number[] }> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");
  const ids = [...new Set(options.portalPdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return { sync: { clientes: 0, pdvs: 0 }, mismatches: [] };

  const sync = await syncPlayerGatewayRegistryForPdvIds(ids);
  if (sync.pdvs === 0) throw new Error("sync_nenhum_pdv");

  const statuses = await fetchPdvGatewayProgramacaoStatus(ids);
  const mismatches = statuses
    .filter((s) => s.origemProgramacaoId !== options.programacaoPortalId)
    .map((s) => s.portalPdvId);
  if (mismatches.length > 0) {
    throw new Error(`programa_gateway_desalinhado:${mismatches.join(",")}`);
  }

  await signalPlayerProgramacaoUpdate(options.portalClienteId, ids);

  return { sync, mismatches: [] };
}
