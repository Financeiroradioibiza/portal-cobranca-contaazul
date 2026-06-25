import { prisma } from "@/lib/prisma";
import { addMusicasToPasta } from "@/lib/criacao/programacaoService";

/** Coloca faixas processadas nas pastas escolhidas no upload. Idempotente. */
export async function applyPendingPastaUploads(limit = 80): Promise<number> {
  const items = await prisma.$queryRaw<
    Array<{ id: string; musicaId: string; pastaId: string }>
  >`
    SELECT pi.id,
           pi.musica_id AS "musicaId",
           j.pasta_id AS "pastaId"
      FROM processamento_item pi
      JOIN processamento_job j ON j.id = pi.job_id
     WHERE pi.status = 'concluido'
       AND pi.musica_id IS NOT NULL
       AND j.pasta_id IS NOT NULL
       AND j.status = 'concluido'
       AND NOT EXISTS (
         SELECT 1 FROM pasta_musica pm
          WHERE pm.pasta_id = j.pasta_id
            AND pm.musica_id = pi.musica_id
       )
     ORDER BY pi.updated_at DESC
     LIMIT ${Math.min(200, Math.max(1, limit))}
  `;

  let applied = 0;
  for (const item of items) {
    const n = await addMusicasToPasta(item.pastaId, [item.musicaId]);
    if (n > 0) applied += n;
  }
  return applied;
}
