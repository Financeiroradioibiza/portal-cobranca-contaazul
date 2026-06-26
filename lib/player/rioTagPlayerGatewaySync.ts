import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { patchPlayerGatewayPdvStatus } from "@/lib/player/patchPlayerGatewayPdvStatus";
import { proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import { prisma } from "@/lib/prisma";
import {
  effectiveRioTagCobranca,
  rioTagCobrancaBloqueiaPlayer,
} from "@/lib/rio/rioTagCobranca";

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

async function gatewayStatusForRioKey(rioKey: string): Promise<"A" | "I"> {
  const key = rioKey.trim();
  if (!key) return "A";

  if (key.startsWith("linha:")) {
    const linhaId = key.slice("linha:".length);
    const linha = await prisma.rioCompClienteLinha.findUnique({
      where: { id: linhaId },
      select: { tagCobranca: true },
    });
    return rioTagCobrancaBloqueiaPlayer(linha?.tagCobranca) ? "I" : "A";
  }

  const pdv = await prisma.rioCompPdv.findUnique({
    where: { id: key },
    select: {
      tagCobranca: true,
      cliente: { select: { tagCobranca: true } },
    },
  });
  if (!pdv) return "A";

  const tag = effectiveRioTagCobranca(pdv.tagCobranca, pdv.cliente?.tagCobranca);
  if (rioTagCobrancaBloqueiaPlayer(tag)) return "I";

  const cad = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey: key },
    select: { statusPlayer: true },
  });
  return cad?.statusPlayer === "Inativo" ? "I" : "A";
}

/**
 * Propaga tag Rio (cancelado / bloqueio financeiro) → `pdvs.status` no gateway.
 * Lê a tag direto do registro editado na Planilha — não depende de `producao.rio_source_ym`.
 */
async function syncPlayerGatewayStatusForRioKeys(rioKeys: string[]): Promise<void> {
  if (!cloud2Enabled()) return;

  const unique = [...new Set(rioKeys.map((k) => k.trim()).filter(Boolean))];
  const byPortalId = new Map<number, "A" | "I">();

  for (const rioKey of unique) {
    const portalIds = await portalPdvIdsForRioKeys([rioKey]);
    if (portalIds.length === 0) {
      console.warn("[rioTagPlayerGatewaySync] sem portal id para", rioKey);
      continue;
    }
    const status = await gatewayStatusForRioKey(rioKey);
    for (const id of portalIds) byPortalId.set(id, status);
  }

  if (byPortalId.size === 0) return;

  await patchPlayerGatewayPdvStatus(
    [...byPortalId.entries()].map(([id, status]) => ({ id, status })),
  );
}

/** Propaga tag Rio (cancelado / bloqueio financeiro) → gateway após editar PDV na Planilha. */
export async function syncPlayerGatewayAfterRioPdvTagChange(pdvId: string): Promise<void> {
  try {
    await syncPlayerGatewayStatusForRioKeys([pdvId]);
  } catch (e) {
    console.error("[rioTagPlayerGatewaySync] pdv", { pdvId, err: e });
  }
}

/** Propaga tag Rio da linha (cliente) para todos os PDVs do bucket + proxy linha. */
export async function syncPlayerGatewayAfterRioLinhaTagChange(linhaId: string): Promise<void> {
  try {
    const pdvs = await prisma.rioCompPdv.findMany({
      where: { clienteId: linhaId, movimento: { not: "saida" } },
      select: { id: true },
    });
    const rioKeys = pdvs.map((p) => p.id);
    rioKeys.push(linhaAsPdvKey(linhaId));
    await syncPlayerGatewayStatusForRioKeys(rioKeys);
  } catch (e) {
    console.error("[rioTagPlayerGatewaySync] linha", { linhaId, err: e });
  }
}
