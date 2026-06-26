import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { syncPlayerGatewayRegistryForPdvIds } from "@/lib/player/playerGatewaySync";
import { proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import { prisma } from "@/lib/prisma";

async function portalPdvIdsForRioKeys(rioKeys: string[]): Promise<number[]> {
  const layout = await getProducaoCatalogLayout();
  const ids = new Set<number>();
  for (const key of rioKeys) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const direct = layout.portalPdvIdsByRioPdvKey[trimmed];
    if (direct != null && direct > 0) {
      ids.add(Math.trunc(direct));
      continue;
    }
    if (trimmed.startsWith("linha:")) {
      const linhaId = trimmed.slice("linha:".length);
      const bucketKey = layout.pdvPlacements.find((p) => p.rioLinhaId === linhaId)?.targetClienteKey;
      const portalClienteId =
        bucketKey != null ? layout.portalClienteIdsByBucketKey[bucketKey] : undefined;
      if (portalClienteId != null && portalClienteId > 0) {
        ids.add(proxyPortalPdvId(portalClienteId));
      }
    }
  }
  return [...ids];
}

/** Propaga tag Rio (cancelado / bloqueio financeiro) → gateway após editar PDV na Planilha. */
export async function syncPlayerGatewayAfterRioPdvTagChange(pdvId: string): Promise<void> {
  if (!cloud2Enabled()) return;
  const portalIds = await portalPdvIdsForRioKeys([pdvId]);
  if (portalIds.length === 0) return;
  await syncPlayerGatewayRegistryForPdvIds(portalIds).catch((e) => {
    console.error("[rioTagPlayerGatewaySync] pdv", { pdvId, err: e });
  });
}

/** Propaga tag Rio da linha (cliente) para todos os PDVs do bucket + proxy linha. */
export async function syncPlayerGatewayAfterRioLinhaTagChange(linhaId: string): Promise<void> {
  if (!cloud2Enabled()) return;
  const pdvs = await prisma.rioCompPdv.findMany({
    where: { clienteId: linhaId, movimento: { not: "saida" } },
    select: { id: true },
  });
  const rioKeys = pdvs.map((p) => p.id);
  rioKeys.push(linhaAsPdvKey(linhaId));
  const portalIds = await portalPdvIdsForRioKeys(rioKeys);
  if (portalIds.length === 0) return;
  await syncPlayerGatewayRegistryForPdvIds(portalIds).catch((e) => {
    console.error("[rioTagPlayerGatewaySync] linha", { linhaId, err: e });
  });
}
