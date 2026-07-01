#!/usr/bin/env npx tsx
/**
 * Zera trim automático gravado antes da regra "trim só manual".
 * Mantém trim em faixas com mix_auto=false (criativo ajustou mix manualmente).
 *
 *   npx tsx scripts/zerar-trim-auto-biblioteca.ts
 *   npx tsx scripts/zerar-trim-auto-biblioteca.ts --dry-run
 */
import { prisma } from "../lib/prisma";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const where = {
    mixAuto: true,
    OR: [{ trimFimMs: { gt: 0 } }, { trimInicioMs: { gt: 0 } }],
  };

  const count = await prisma.musicaBiblioteca.count({ where });
  console.log(`Faixas com trim auto (mix_auto=true): ${count}`);

  if (dryRun || count === 0) return;

  const res = await prisma.musicaBiblioteca.updateMany({
    where,
    data: { trimFimMs: 0, trimInicioMs: 0 },
  });
  console.log(`Atualizadas: ${res.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
