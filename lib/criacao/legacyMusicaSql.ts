import { Prisma } from "@prisma/client";

/** Faixa legada = upload anterior ao pipeline atual (128 mono + LUFS + master). */
export const LEGACY_MUSICA_SQL = Prisma.sql`(
  m.loudness_lufs IS NULL
  OR m.master_storage_key IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM musica_versao v
     WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
  )
)`;
