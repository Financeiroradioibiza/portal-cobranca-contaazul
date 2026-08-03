import { prisma } from "@/lib/prisma";
import { addMusicasToPasta } from "@/lib/criacao/programacaoService";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";

const PASTA_UPLOAD_BATCH = 120;

type PendingPastaRow = { id: string; musicaId: string; pastaId: string };

/** Coloca faixas processadas nas pastas escolhidas no upload. Idempotente. */
export async function applyPendingPastaUploads(limit = 80): Promise<number> {
  const items = await prisma.$queryRaw<PendingPastaRow[]>`
    SELECT pi.id,
           pi.musica_id AS "musicaId",
           j.pasta_id AS "pastaId"
      FROM processamento_item pi
      JOIN processamento_job j ON j.id = pi.job_id
     WHERE pi.status = 'concluido'
       AND pi.musica_id IS NOT NULL
       AND j.pasta_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM processamento_item pi2
          WHERE pi2.job_id = j.id
            AND pi2.status IN ('aguardando', 'processando')
       )
       AND EXISTS (
         SELECT 1 FROM musica_biblioteca mb WHERE mb.id = pi.musica_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM pasta_musica pm
          WHERE pm.pasta_id = j.pasta_id
            AND pm.musica_id = pi.musica_id
       )
     ORDER BY pi.updated_at DESC
     LIMIT ${Math.min(500, Math.max(1, limit))}
  `;
  return applyPastaUploadItems(items);
}

/** Aplica **todas** as faixas concluídas do job na pasta — não espera resolver duplicatas. */
export async function applyPendingPastaUploadsForJob(jobId: string): Promise<number> {
  const job = await prisma.processamentoJob.findUnique({
    where: { id: jobId },
    select: { pastaId: true },
  });
  if (!job?.pastaId) return 0;

  let total = 0;
  while (true) {
    const items = await prisma.$queryRaw<PendingPastaRow[]>`
      SELECT pi.id,
             pi.musica_id AS "musicaId",
             j.pasta_id AS "pastaId"
        FROM processamento_item pi
        JOIN processamento_job j ON j.id = pi.job_id
       WHERE j.id = ${jobId}
         AND pi.status = 'concluido'
         AND pi.musica_id IS NOT NULL
         AND j.pasta_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM musica_biblioteca mb WHERE mb.id = pi.musica_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM pasta_musica pm
            WHERE pm.pasta_id = j.pasta_id
              AND pm.musica_id = pi.musica_id
         )
       ORDER BY pi.created_at ASC
       LIMIT ${PASTA_UPLOAD_BATCH}
    `;
    if (items.length === 0) break;
    const musicaIds = items.map((i) => i.musicaId);
    total += await addMusicasToPasta(job.pastaId, musicaIds);
    if (items.length < PASTA_UPLOAD_BATCH) break;
  }

  if (total > 0) {
    const pasta = await prisma.pasta.findUnique({
      where: { id: job.pastaId },
      select: { programacaoId: true },
    });
    if (pasta?.programacaoId) {
      await abrirAtualizacao(pasta.programacaoId, "Fila processamento").catch(() => {});
    }
  }

  return total;
}

/** Drena fila global de pastas pendentes (vários jobs). */
export async function applyAllPendingPastaUploads(maxTotal = 8000): Promise<number> {
  let total = 0;
  while (total < maxTotal) {
    const n = await applyPendingPastaUploads(PASTA_UPLOAD_BATCH);
    if (n === 0) break;
    total += n;
  }
  return total;
}

async function applyPastaUploadItems(items: PendingPastaRow[]): Promise<number> {
  if (items.length === 0) return 0;

  let applied = 0;
  const programacaoIds = new Set<string>();
  const byPasta = new Map<string, string[]>();
  for (const item of items) {
    const list = byPasta.get(item.pastaId) ?? [];
    list.push(item.musicaId);
    byPasta.set(item.pastaId, list);
  }

  for (const [pastaId, musicaIds] of byPasta) {
    try {
      const n = await addMusicasToPasta(pastaId, musicaIds);
      if (n > 0) {
        applied += n;
        const pasta = await prisma.pasta.findUnique({
          where: { id: pastaId },
          select: { programacaoId: true },
        });
        if (pasta?.programacaoId) programacaoIds.add(pasta.programacaoId);
      }
    } catch (e) {
      console.warn("[pastaUploadService] falha ao colocar faixas na pasta", {
        pastaId,
        count: musicaIds.length,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (const progId of programacaoIds) {
    await abrirAtualizacao(progId, "Fila processamento").catch(() => {});
  }

  return applied;
}
