import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";

export type PlayerGatewayPdvStatusPatch = {
  id: number;
  status: "A" | "I";
};

/** Atualiza só `pdvs.status` no gateway — usado após tag Rio na Planilha. */
export async function patchPlayerGatewayPdvStatus(
  pdvs: PlayerGatewayPdvStatusPatch[],
): Promise<{ updated: number }> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");

  const byId = new Map<number, "A" | "I">();
  for (const p of pdvs) {
    const id = Math.trunc(p.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, p.status === "I" ? "I" : "A");
  }
  const payload = [...byId.entries()].map(([id, status]) => ({ id, status }));
  if (payload.length === 0) return { updated: 0 };

  const res = await cloud2FetchWithTimeout(
    "/player/patch-pdv-status",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdvs: payload }),
    },
    15_000,
  );
  const data = await parseCloud2Json<{ ok?: boolean; updated?: number; error?: string }>(
    res,
    "patch_pdv_status",
  );
  if (!res?.ok || !data.ok) {
    throw new Error(data.error ?? "patch_pdv_status_falhou");
  }
  return { updated: data.updated ?? payload.length };
}
