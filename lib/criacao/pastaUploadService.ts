import { prisma } from "@/lib/prisma";
import { addMusicasToPasta } from "@/lib/criacao/programacaoService";

/** Coloca faixas processadas nas pastas escolhidas no upload. Idempotente. */
export async function applyPendingPastaUploads(limit = 80): Promise<number> {
  const items = await prisma.processamentoItem.findMany({
    where: {
      status: "concluido",
      musicaId: { not: null },
      job: { pastaId: { not: null } },
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      job: { select: { pastaId: true } },
    },
  });

  let applied = 0;
  for (const item of items) {
    if (!item.musicaId || !item.job.pastaId) continue;
    const n = await addMusicasToPasta(item.job.pastaId, [item.musicaId]);
    if (n > 0) applied += n;
  }
  return applied;
}
