#!/usr/bin/env npx tsx
/**
 * Lista faixas legadas (pipeline antigo, sem 128 mono / LUFS / master).
 *
 *   npx tsx scripts/listar-musicas-legado.ts
 *   npx tsx scripts/listar-musicas-legado.ts --delete
 */
import { prisma } from "../lib/prisma";
import { LEGACY_MUSICA_SQL } from "../lib/criacao/legacyMusicaCriteria";
import { deleteAllLegacyMusicas } from "../lib/criacao/bibliotecaService";

const doDelete = process.argv.includes("--delete");

async function main() {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      titulo: string;
      artista: string;
      status: string;
      created_at: Date;
      loudness_lufs: number | null;
      master_storage_key: string | null;
      tem_128_mono: boolean;
      programacoes: number;
    }[]
  >`
    SELECT
      m.id,
      m.titulo,
      m.artista,
      m.status::text,
      m.created_at,
      m.loudness_lufs,
      m.master_storage_key,
      EXISTS (
        SELECT 1 FROM musica_versao v
         WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
      ) AS tem_128_mono,
      COALESCE((
        SELECT COUNT(DISTINCT p.programacao_id)::int
          FROM pasta_musica pm
          JOIN pasta p ON p.id = pm.pasta_id
         WHERE pm.musica_id = m.id
      ), 0) AS programacoes
      FROM musica_biblioteca m
     WHERE ${LEGACY_MUSICA_SQL}
     ORDER BY m.created_at ASC`;

  console.log(`Faixas legadas: ${rows.length}\n`);

  for (const r of rows) {
    const flags = [
      r.loudness_lufs == null ? "sem LUFS" : null,
      !r.master_storage_key ? "sem master" : null,
      !r.tem_128_mono ? "sem 128 mono" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const prog = r.programacoes > 0 ? ` · ${r.programacoes} prog.` : "";
    console.log(
      `${r.created_at.toISOString().slice(0, 10)} · ${r.id.slice(0, 8)} · ${r.artista} — ${r.titulo} [${r.status}] (${flags})${prog}`,
    );
  }

  if (!doDelete || rows.length === 0) {
    if (!doDelete && rows.length > 0) {
      console.log("\nPara apagar todas: npx tsx scripts/listar-musicas-legado.ts --delete");
    }
    return;
  }

  console.log(`\nApagando ${rows.length} faixa(s)…`);
  const result = await deleteAllLegacyMusicas();
  console.log(`Concluído: ${result.deleted} apagada(s), ${result.failed} falha(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
