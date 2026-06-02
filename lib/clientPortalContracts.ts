import { prisma } from "@/lib/prisma";

/** Lotes na Conta Azul — cada pedido HTTP fica abaixo do timeout do Netlify (~26 s). */
export const CONTRACTS_REFRESH_BATCH_SIZE = 10;

const MAX_NUMBERS_LEN = 400;

export function trimContractNumbersText(s: string): string {
  return s.trim().slice(0, MAX_NUMBERS_LEN);
}

/** Grava números de contrato ATIVO já buscados na CA (por cliente). */
export async function persistClientContractsBatch(byClientId: Map<string, string>): Promise<void> {
  const now = new Date();
  const ops = [...byClientId.entries()].map(([clientId, raw]) => {
    const activeContractNumbers = trimContractNumbersText(raw);
    const hasActiveContract = activeContractNumbers.length > 0;
    return prisma.clientPortalMeta.upsert({
      where: { clientId },
      create: {
        clientId,
        hasActiveContract,
        activeContractNumbers,
        contractsFetchedAt: now,
        note: "",
        painelBloqueio: false,
        painelInativo: false,
        clienteDestaque: false,
      },
      update: {
        hasActiveContract,
        activeContractNumbers,
        contractsFetchedAt: now,
      },
    });
  });
  if (ops.length) await prisma.$transaction(ops);
}
