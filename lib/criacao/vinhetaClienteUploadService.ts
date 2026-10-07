import { prisma } from "@/lib/prisma";
import { addMusicaToVinhetasClientes } from "@/lib/criacao/vinhetaClienteBibliotecaService";

/** Coloca faixas processadas na pasta Vinhetas clientes. Idempotente. */
export async function applyPendingVinhetaClienteUploads(limit = 80): Promise<number> {
  const items = await prisma.$queryRaw<
    Array<{ id: string; musicaId: string }>
  >`
    SELECT pi.id,
           pi.musica_id AS "musicaId"
      FROM processamento_item pi
      JOIN processamento_job j ON j.id = pi.job_id
     WHERE pi.status = 'concluido'
       AND pi.musica_id IS NOT NULL
       AND j.destino_vinheta_cliente = true
       AND j.status IN ('concluido', 'revisao')
       AND NOT EXISTS (
         SELECT 1 FROM biblioteca_vinheta_cliente bvc
          WHERE bvc.musica_id = pi.musica_id
       )
     ORDER BY pi.updated_at DESC
     LIMIT ${Math.min(200, Math.max(1, limit))}
  `;

  let applied = 0;
  for (const item of items) {
    await addMusicaToVinhetasClientes(item.musicaId);
    applied += 1;
  }
  return applied;
}
