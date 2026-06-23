import { cloud2Enabled, cloud2Fetch, parseCloud2Json } from "@/lib/criacao/cloud2Client";

/** Marca PDVs com atualizacao_pendente='S' — Player 5 refaz /playlist/ no próximo ping. */
export async function signalPlayerProgramacaoUpdate(
  clienteIdGateway: number,
  pdvIds?: number[],
): Promise<{ pdvs: number }> {
  if (!cloud2Enabled() || !Number.isFinite(clienteIdGateway) || clienteIdGateway <= 0) {
    return { pdvs: 0 };
  }
  const body: { clienteId: number; pdvIds?: number[] } = { clienteId: clienteIdGateway };
  if (pdvIds && pdvIds.length > 0) body.pdvIds = pdvIds;

  const res = await cloud2Fetch("/player/signal-atualizacao", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await parseCloud2Json<{ ok?: boolean; pdvs?: number; error?: string }>(
    res,
    "signal_atualizacao",
  );
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "signal_atualizacao_falhou");
  }
  return { pdvs: data.pdvs ?? 0 };
}
