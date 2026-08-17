import { getPortalPdvIdsForProgramacao } from "@/lib/criacao/pdvProgramacaoService";
import { syncProgramacaoPdvsToGateway } from "@/lib/player/pdvProgramacaoGatewaySync";
import { SYNC_PDV_BATCH_SIZE } from "@/lib/player/playerGatewaySync";
import { prisma } from "@/lib/prisma";
import {
  cloud2Enabled,
  cloud2Fetch,
  cloud2FetchWithTimeout,
  parseCloud2Json,
} from "@/lib/criacao/cloud2Client";

/** Lotes de PDV na amarração pós-publicar (evita timeout Netlify/cloud2). */
export const PUBLICAR_PDV_BATCH_SIZE = SYNC_PDV_BATCH_SIZE;

export type GatewayCliente = { id: number; nome: string; pdvs: number };

export async function listGatewayClientes(): Promise<GatewayCliente[]> {
  if (!cloud2Enabled()) return [];
  const res = await cloud2Fetch("/gateway-clientes");
  if (!res.ok) throw new Error("gateway_clientes_falhou");
  const data = (await res.json()) as { ok?: boolean; clientes?: GatewayCliente[] };
  return data.clientes ?? [];
}

export type PublicarResultado = {
  ok: boolean;
  playlists: number;
  musicas: number;
  semArquivo: number;
  vinhetasSemAudio: number;
  clienteGatewayId: number;
  clienteGatewayNome: string;
};

function chunkPdvIds(ids: number[], size = PUBLICAR_PDV_BATCH_SIZE): number[][] {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

async function linkProgramacaoPdvsBatch(
  programacaoId: string,
  clienteIdGateway: number,
  pdvIds: number[],
): Promise<number> {
  const res = await cloud2FetchWithTimeout(
    "/publicar/link-pdvs",
    {
      method: "POST",
      body: JSON.stringify({
        programacaoId,
        clienteIdGateway,
        pdvIds,
      }),
    },
    45_000,
  );
  const data = await parseCloud2Json<{
    ok?: boolean;
    error?: string;
    detail?: string;
    pdvsLinked?: number;
  }>(res, "publicar_link_pdvs");
  if (!res?.ok || !data.ok) {
    if (res?.status === 404) {
      throw new Error("link_pdv_rota_ausente: atualize o cloud2 (rota /publicar/link-pdvs)");
    }
    const detail = data.detail?.trim();
    throw new Error(
      detail ?
        `${data.error ?? "link_pdv_falhou"}: ${detail}`
      : (data.error ?? "link_pdv_falhou"),
    );
  }
  return data.pdvsLinked ?? pdvIds.length;
}

export type LinkProgramacaoPdvsResult = {
  totalPdvs: number;
  totalBatches: number;
  batchIndex: number;
  linkedThisBatch: number;
  totalLinked: number;
  done: boolean;
};

/** Amarra PDVs no gateway em lotes (10). Com `batchIndex`, processa só um lote (evita 504 Netlify). */
export async function linkProgramacaoPdvsBatches(
  programacaoId: string,
  clienteIdGateway: number,
  pdvIds: number[],
  opts?: { batchIndex?: number },
): Promise<LinkProgramacaoPdvsResult> {
  const batches = chunkPdvIds(pdvIds);
  const totalPdvs = [...new Set(pdvIds.filter((id) => Number.isFinite(id) && id > 0))].length;
  if (batches.length === 0) {
    const { signalPlayerProgramacaoUpdate } = await import("@/lib/player/signalPlayerProgramacaoUpdate");
    await signalPlayerProgramacaoUpdate(clienteIdGateway);
    return {
      totalPdvs: 0,
      totalBatches: 0,
      batchIndex: 0,
      linkedThisBatch: 0,
      totalLinked: 0,
      done: true,
    };
  }

  async function linkOneBatch(batchIndex: number): Promise<number> {
    const batch = batches[batchIndex]!;
    const linked = await linkProgramacaoPdvsBatch(programacaoId, clienteIdGateway, batch);
    await syncProgramacaoPdvsToGateway({
      portalClienteId: clienteIdGateway,
      portalPdvIds: batch,
      programacaoPortalId: programacaoId,
    });
    return linked;
  }

  if (opts?.batchIndex === undefined) {
    let totalLinked = 0;
    for (let i = 0; i < batches.length; i++) {
      totalLinked += await linkOneBatch(i);
    }
    if (totalPdvs > 0 && totalLinked < totalPdvs) {
      throw new Error(`pdv_programa_nao_amarrado: esperados ${totalPdvs}, amarrados ${totalLinked}`);
    }
    return {
      totalPdvs,
      totalBatches: batches.length,
      batchIndex: batches.length - 1,
      linkedThisBatch: batches[batches.length - 1]!.length,
      totalLinked,
      done: true,
    };
  }

  const batchIndex = opts.batchIndex;
  if (batchIndex < 0 || batchIndex >= batches.length) {
    throw new Error("batch_index_invalido");
  }

  const linkedThisBatch = await linkOneBatch(batchIndex);

  let totalLinked = linkedThisBatch;
  for (let i = 0; i < batchIndex; i++) {
    totalLinked += batches[i]!.length;
  }

  const done = batchIndex >= batches.length - 1;
  if (done && totalLinked < totalPdvs) {
    throw new Error(`pdv_programa_nao_amarrado: esperados ${totalPdvs}, amarrados ${totalLinked}`);
  }

  return {
    totalPdvs,
    totalBatches: batches.length,
    batchIndex,
    linkedThisBatch,
    totalLinked,
    done,
  };
}

/**
 * Publica a programação no gateway do Player 5 (cloud2) e marca como publicada no Neon.
 * O áudio continua sendo servido direto pelo cloud2 — nada passa pelo Netlify.
 *
 * PDVs: publica faixas/cronograma uma vez; amarra lojas em lotes de {@link PUBLICAR_PDV_BATCH_SIZE}.
 * `skipPdvLink`: só `/publicar` (disparo com muitos PDVs — amarração via `/amarrar-pdvs`).
 */
export async function publicarProgramacao(
  programacaoId: string,
  clienteIdGateway: number,
  pdvIds?: number[],
  opts?: { skipPdvLink?: boolean },
): Promise<PublicarResultado> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, nome: true, clienteNome: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  let portalPdvIdsToSync = pdvIds?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
  if (portalPdvIdsToSync.length === 0) {
    try {
      const linked = await getPortalPdvIdsForProgramacao(programacaoId);
      portalPdvIdsToSync = linked.portalPdvIds;
    } catch {
      portalPdvIdsToSync = [];
    }
  }

  const res = await cloud2FetchWithTimeout(
    "/publicar",
    {
      method: "POST",
      body: JSON.stringify({
        programacaoId,
        clienteIdGateway,
      }),
    },
    120_000,
  );
  const data = await parseCloud2Json<{
    ok?: boolean;
    error?: string;
    detail?: string;
    playlists?: number;
    musicas?: number;
    semArquivo?: number;
    vinhetasSemAudio?: number;
  }>(res, "publicar");
  if (!res?.ok || !data.ok) {
    const detail = data.detail?.trim();
    throw new Error(
      detail ? `${data.error ?? "publicar_falhou"}: ${detail}` : (data.error ?? "publicar_falhou"),
    );
  }

  if (!opts?.skipPdvLink) {
    await linkProgramacaoPdvsBatches(programacaoId, clienteIdGateway, portalPdvIdsToSync);
  } else if (portalPdvIdsToSync.length === 0) {
    const { signalPlayerProgramacaoUpdate } = await import("@/lib/player/signalPlayerProgramacaoUpdate");
    await signalPlayerProgramacaoUpdate(clienteIdGateway);
  }

  await prisma.programacao.update({
    where: { id: programacaoId },
    data: { publicada: true, publishedAt: new Date() },
  });

  const gw = await listGatewayClientes().catch(() => [] as GatewayCliente[]);
  const cli = gw.find((c) => c.id === clienteIdGateway);

  return {
    ok: true,
    playlists: data.playlists ?? 0,
    musicas: data.musicas ?? 0,
    semArquivo: data.semArquivo ?? 0,
    vinhetasSemAudio: data.vinhetasSemAudio ?? 0,
    clienteGatewayId: clienteIdGateway,
    clienteGatewayNome: cli?.nome ?? String(clienteIdGateway),
  };
}

/**
 * Propaga flags das pastas **e** cronogramas (agendas/vinhetas) ao gateway — sem republicar faixas.
 * Usado ao marcar selecionável ou editar agendamentos no portal.
 */
export async function syncPastaFlagsProgramacao(programacaoId: string): Promise<void> {
  if (!cloud2Enabled()) return;

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { publicada: true, clienteGatewayId: true },
  });
  if (!prog?.publicada || !prog.clienteGatewayId) return;

  const res = await cloud2FetchWithTimeout(
    "/sync-pasta-flags",
    {
      method: "POST",
      body: JSON.stringify({
        programacaoId,
        clienteIdGateway: prog.clienteGatewayId,
      }),
    },
    30_000,
  );
  const data = await parseCloud2Json<{ ok?: boolean; error?: string; detail?: string }>(
    res,
    "sync-pasta-flags",
  );
  if (!res?.ok || !data.ok) {
    const detail = data.detail?.trim();
    throw new Error(
      detail ?
        `${data.error ?? "sync_pasta_flags_falhou"}: ${detail}`
      : (data.error ?? "sync_pasta_flags_falhou"),
    );
  }

  const { signalPlayerProgramacaoUpdate } = await import("@/lib/player/signalPlayerProgramacaoUpdate");
  await signalPlayerProgramacaoUpdate(prog.clienteGatewayId);
}

/** Sugere o cliente do gateway cujo nome mais se aproxima do cliente da produção. */
export function sugerirGatewayCliente(
  clienteNome: string,
  clientes: GatewayCliente[],
): GatewayCliente | null {
  const alvo = clienteNome.trim().toLowerCase();
  if (!alvo || clientes.length === 0) return null;
  const exato = clientes.find((c) => c.nome.trim().toLowerCase() === alvo);
  if (exato) return exato;
  const contem = clientes.find(
    (c) => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()),
  );
  return contem ?? null;
}
