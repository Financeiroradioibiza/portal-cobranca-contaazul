import { getPortalPdvIdsForProgramacao } from "@/lib/criacao/pdvProgramacaoService";
import { syncProgramacaoPdvsToGateway } from "@/lib/player/pdvProgramacaoGatewaySync";
import { prisma } from "@/lib/prisma";
import {
  cloud2Enabled,
  cloud2Fetch,
  cloud2FetchWithTimeout,
  parseCloud2Json,
} from "@/lib/criacao/cloud2Client";

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
  clienteGatewayId: number;
  clienteGatewayNome: string;
};

/**
 * Publica a programação no gateway do Player 5 (cloud2) e marca como publicada no Neon.
 * O áudio continua sendo servido direto pelo cloud2 — nada passa pelo Netlify.
 */
export async function publicarProgramacao(
  programacaoId: string,
  clienteIdGateway: number,
  pdvIds?: number[],
): Promise<PublicarResultado> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, nome: true, clienteNome: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const res = await cloud2FetchWithTimeout(
    "/publicar",
    {
      method: "POST",
      body: JSON.stringify({
        programacaoId,
        clienteIdGateway,
        pdvIds: pdvIds?.length ? pdvIds : undefined,
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
    pdvsLinked?: number;
  }>(res, "publicar");
  if (!res?.ok || !data.ok) {
    const detail = data.detail?.trim();
    throw new Error(
      detail ? `${data.error ?? "publicar_falhou"}: ${detail}` : (data.error ?? "publicar_falhou"),
    );
  }

  const pdvIdsEnviados = pdvIds?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
  if (pdvIdsEnviados.length > 0) {
    const linked = data.pdvsLinked ?? 0;
    if (linked < pdvIdsEnviados.length) {
      throw new Error(
        `pdv_programa_nao_amarrado: esperados ${pdvIdsEnviados.length}, amarrados ${linked}`,
      );
    }
  }

  await prisma.programacao.update({
    where: { id: programacaoId },
    data: { publicada: true, publishedAt: new Date() },
  });

  let portalPdvIdsToSync = pdvIds?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
  if (portalPdvIdsToSync.length === 0) {
    try {
      const linked = await getPortalPdvIdsForProgramacao(programacaoId);
      portalPdvIdsToSync = linked.portalPdvIds;
    } catch {
      portalPdvIdsToSync = [];
    }
  }

  if (portalPdvIdsToSync.length > 0) {
    await syncProgramacaoPdvsToGateway({
      portalClienteId: clienteIdGateway,
      portalPdvIds: portalPdvIdsToSync,
      programacaoPortalId: programacaoId,
    });
  } else {
    const { signalPlayerProgramacaoUpdate } = await import("@/lib/player/signalPlayerProgramacaoUpdate");
    await signalPlayerProgramacaoUpdate(clienteIdGateway);
  }

  const gw = await listGatewayClientes().catch(() => [] as GatewayCliente[]);
  const cli = gw.find((c) => c.id === clienteIdGateway);

  return {
    ok: true,
    playlists: data.playlists ?? 0,
    musicas: data.musicas ?? 0,
    semArquivo: data.semArquivo ?? 0,
    clienteGatewayId: clienteIdGateway,
    clienteGatewayNome: cli?.nome ?? String(clienteIdGateway),
  };
}

/**
 * Propaga só a flag «Selecionável» das pastas ao gateway (sem republicar faixas).
 * Usado ao marcar/desmarcar no portal — evita exigir republicação completa.
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
