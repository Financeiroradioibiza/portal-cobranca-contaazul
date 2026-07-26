/**
 * Contagem rápida: legado vs B2 completo vs disco.
 *   npx tsx scripts/count-biblioteca-b2-mix.ts
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Prisma } from "@prisma/client";

const root = path.resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) loadEnv({ path: p });
}

async function main(): Promise<void> {
  const { prisma } = await import("../lib/prisma");
  const { LEGACY_MUSICA_SQL } = await import("../lib/criacao/legacyMusicaSql");

  const B2_FULL = Prisma.sql`(
    m.master_storage_key IS NOT NULL
    AND m.master_storage_key NOT LIKE 'local:%'
    AND EXISTS (
      SELECT 1 FROM musica_versao v
       WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
         AND v.storage_key LIKE 'b2:%'
    )
  )`;

  const [total, legacy, b2Full, preB2, masterLocal, usoDisk] = await Promise.all([
    prisma.musicaBiblioteca.count(),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM musica_biblioteca m WHERE ${LEGACY_MUSICA_SQL}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM musica_biblioteca m WHERE ${B2_FULL}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM musica_biblioteca m WHERE NOT ${B2_FULL}`,
    prisma.musicaBiblioteca.count({ where: { masterStorageKey: { startsWith: "local:" } } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM musica_biblioteca m
       WHERE EXISTS (
         SELECT 1 FROM musica_versao v
          WHERE v.musica_id = m.id AND v.formato::text = 'mp3_128_mono'
            AND v.storage_key LIKE 'uso:%'
       )`,
  ]);

  console.log(
    JSON.stringify(
      {
        total,
        b2Full: b2Full[0]?.n ?? 0,
        preB2NotFull: preB2[0]?.n ?? 0,
        legacyPipelineAntigo: legacy[0]?.n ?? 0,
        masterLocal,
        uso128Disco: usoDisk[0]?.n ?? 0,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
