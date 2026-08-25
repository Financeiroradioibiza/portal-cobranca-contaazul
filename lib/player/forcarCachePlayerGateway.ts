import { cloud2Enabled, cloud2Fetch, parseCloud2Json } from "@/lib/criacao/cloud2Client";

/** Marca PDVs com forcar_cache_completo='S' — Player 5 retoma cache no próximo ping. */
export async function forcarCachePlayerGateway(pdvIds: number[]): Promise<{ pdvs: number }> {
  const ids = [...new Set(pdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!cloud2Enabled() || ids.length === 0) {
    return { pdvs: 0 };
  }

  const res = await cloud2Fetch("/player/forcar-cache", {
    method: "POST",
    body: JSON.stringify({ pdvIds: ids }),
  });
  const data = await parseCloud2Json<{ ok?: boolean; pdvs?: number; error?: string }>(
    res,
    "forcar_cache",
  );
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "forcar_cache_falhou");
  }
  return { pdvs: data.pdvs ?? 0 };
}
