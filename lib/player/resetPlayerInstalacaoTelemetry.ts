import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";

/** Apaga ping/cache no gateway após regerar token — UI do suporte volta ao estado «aguardando». */
export async function resetPlayerInstalacaoTelemetry(portalPdvId: number): Promise<void> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");
  const id = Math.trunc(portalPdvId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("pdv_id_invalido");

  const res = await cloud2FetchWithTimeout(
    "/player/reset-instalacao",
    {
      method: "POST",
      body: JSON.stringify({ pdvId: id }),
    },
    15_000,
  );
  const data = await parseCloud2Json<{ ok?: boolean; error?: string }>(res, "reset_instalacao");
  if (!data.ok) throw new Error(data.error ?? "reset_falhou");
}
