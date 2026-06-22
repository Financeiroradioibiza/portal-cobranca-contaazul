import { cloud2Enabled, cloud2Fetch } from "@/lib/criacao/cloud2Client";

/** Marca PDVs com atualizacao_pendente='S' — Player 5 refaz /playlist/ no próximo ping. */
export async function signalPlayerProgramacaoUpdate(
  clienteIdGateway: number,
  pdvIds?: number[],
): Promise<void> {
  if (!cloud2Enabled() || !Number.isFinite(clienteIdGateway) || clienteIdGateway <= 0) return;
  const body: { clienteId: number; pdvIds?: number[] } = { clienteId: clienteIdGateway };
  if (pdvIds && pdvIds.length > 0) body.pdvIds = pdvIds;
  await cloud2Fetch("/player/signal-atualizacao", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => null);
}
