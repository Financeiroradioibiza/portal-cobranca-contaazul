import { prisma } from "@/lib/prisma";
import { addMusicasToPastaEspecial } from "@/lib/criacao/pastaEspecialService";

/** Coloca faixas processadas nas pastas especiais escolhidas no upload. Idempotente. */
export async function applyPendingPastaEspecialUploads(limit = 80): Promise<number> {
  const items = await prisma.$queryRaw<
    Array<{ id: string; musicaId: string; pastaEspecialId: string }>
  >`
    SELECT pi.id,
           pi.musica_id AS "musicaId",
           j.pasta_especial_id AS "pastaEspecialId"
      FROM processamento_item pi
      JOIN processamento_job j ON j.id = pi.job_id
     WHERE pi.status = 'concluido'
       AND pi.musica_id IS NOT NULL
       AND j.pasta_especial_id IS NOT NULL
       AND j.status IN ('concluido', 'revisao')
       AND NOT EXISTS (
         SELECT 1 FROM pasta_especial_musica pem
          WHERE pem.pasta_especial_id = j.pasta_especial_id
            AND pem.musica_id = pi.musica_id
       )
     ORDER BY pi.updated_at DESC
     LIMIT ${Math.min(200, Math.max(1, limit))}
  `;

  let applied = 0;
  for (const item of items) {
    const n = await addMusicasToPastaEspecial(item.pastaEspecialId, [item.musicaId]);
    if (n > 0) applied += n;
  }
  return applied;
}
