import { prisma } from "@/lib/prisma";

export const CONFIG_KEYS = {
  pontoMixPadraoSeg: "criacao.ponto_mix_padrao_seg",
} as const;

export const PONTO_MIX_PADRAO_DEFAULT = 4;
const PONTO_MIX_MIN = 0;
const PONTO_MIX_MAX = 30;

export async function getConfig(chave: string): Promise<string | null> {
  const row = await prisma.portalConfig.findUnique({ where: { chave } });
  return row?.valor ?? null;
}

export async function setConfig(chave: string, valor: string, updatedBy: string): Promise<void> {
  await prisma.portalConfig.upsert({
    where: { chave },
    create: { chave, valor, updatedBy },
    update: { valor, updatedBy },
  });
}

/** @deprecated Não usado no pipeline — mix vem só da detecção (fade/outro quieto). */
export async function getPontoMixPadraoSeg(): Promise<number> {
  const raw = await getConfig(CONFIG_KEYS.pontoMixPadraoSeg);
  const n = Number(raw);
  if (!Number.isFinite(n)) return PONTO_MIX_PADRAO_DEFAULT;
  return clampPontoMix(n);
}

export function clampPontoMix(n: number): number {
  return Math.min(PONTO_MIX_MAX, Math.max(PONTO_MIX_MIN, Math.round(n)));
}
