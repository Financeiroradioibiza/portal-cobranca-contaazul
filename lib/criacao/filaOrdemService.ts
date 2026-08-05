import { prisma } from "@/lib/prisma";

/** Incremento entre blocos na fila (permite inserir no meio depois). */
export const FILA_ORDEM_STEP = 5;

/** Primeiro bloco quando a fila está vazia. */
export const FILA_ORDEM_INITIAL = 1000;

/**
 * Reserva ordens para um lote de jobs (maior = processa antes).
 * Primeiro lote do batch recebe o maior número.
 */
export async function allocateFilaOrdemForBatch(loteCount: number): Promise<number[]> {
  if (loteCount <= 0) return [];

  return prisma.$transaction(async (tx) => {
    const agg = await tx.processamentoJob.aggregate({ _max: { filaOrdem: true } });
    const max = agg._max.filaOrdem;
    const step = FILA_ORDEM_STEP;
    const base = max == null ? FILA_ORDEM_INITIAL : max + step;
    const top = base + (loteCount - 1) * step;
    const out: number[] = [];
    for (let i = 0; i < loteCount; i++) {
      out.push(top - i * step);
    }
    return out;
  });
}

/** Próximo número para um único job. */
export async function allocateNextFilaOrdem(): Promise<number> {
  const [n] = await allocateFilaOrdemForBatch(1);
  return n ?? FILA_ORDEM_INITIAL;
}

/**
 * Insere entre dois blocos (fase drag-and-drop).
 * `moreUrgent` > `lessUrgent` (ex.: 5905 e 5900 → 5901).
 * Retorna null se não couber — aí precisa rebalancear.
 */
export function filaOrdemInsertBetween(moreUrgent: number, lessUrgent: number): number | null {
  if (moreUrgent <= lessUrgent) return null;
  const gap = moreUrgent - lessUrgent;
  if (gap <= 1) return null;
  return lessUrgent + 1;
}
