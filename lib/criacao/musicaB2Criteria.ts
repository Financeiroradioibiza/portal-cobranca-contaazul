import { Prisma } from "@prisma/client";

/** Master no B2 + versão 128 mono com chave b2: no Neon. */
export const B2_FULL_MUSICA_SQL = Prisma.sql`(
  m.master_storage_key IS NOT NULL
  AND m.master_storage_key NOT LIKE 'local:%'
  AND EXISTS (
    SELECT 1 FROM musica_versao v
     WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
       AND v.storage_key LIKE 'b2:%'
  )
)`;

/** Acervo pré-migração B2 (disco uso:, master local:, etc.). */
export const PRE_B2_MUSICA_SQL = Prisma.sql`NOT ${B2_FULL_MUSICA_SQL}`;
