import { cloud2Enabled, cloud2Fetch } from "@/lib/criacao/cloud2Client";

/** Marca PDVs do cliente com atualizacao_pendente='S' — Player 5 refaz /playlist/ no próximo ping. */
export async function signalPlayerProgramacaoUpdate(clienteIdGateway: number): Promise<void> {
  if (!cloud2Enabled() || !Number.isFinite(clienteIdGateway) || clienteIdGateway <= 0) return;
  await cloud2Fetch("/player/signal-atualizacao", {
    method: "POST",
    body: JSON.stringify({ clienteId: clienteIdGateway }),
  }).catch(() => null);
}
