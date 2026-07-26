/**
 * Remove faixas pré-B2 (disco/local) — mantém só master B2 + 128 b2:.
 *
 * Requer DATABASE_URL + CRIACAO_INGEST_SECRET (cloud2 apagar arquivos).
 *
 *   npx tsx scripts/purge-pre-b2-biblioteca.ts           # dry-run
 *   npx tsx scripts/purge-pre-b2-biblioteca.ts --execute
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const root = path.resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) loadEnv({ path: p });
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Falta DATABASE_URL em .env.local");
    process.exit(1);
  }

  const {
    countB2FullMusicas,
    getPreB2DeleteStats,
    listAllPreB2MusicaIds,
  } = await import("../lib/criacao/bibliotecaSearchService");
  const { deleteAllPreB2Musicas } = await import("../lib/criacao/bibliotecaService");
  const { cloud2Enabled } = await import("../lib/criacao/cloud2Client");

  const [stats, keep, ids] = await Promise.all([
    getPreB2DeleteStats(),
    countB2FullMusicas(),
    listAllPreB2MusicaIds(),
  ]);

  console.log("=== Purge pré-B2 ===");
  console.log(`Manter (B2 completo): ${keep}`);
  console.log(`Apagar (pré-B2):      ${stats.total} (${ids.length} ids)`);
  console.log(`Em programações:      ${stats.emProgramacoes}`);
  console.log(`Em pastas:            ${stats.emPastas}`);
  console.log(`Cloud2 delete:        ${cloud2Enabled() ? "sim" : "NÃO — só Neon"}`);

  if (!execute) {
    console.log("\nDry-run. Para executar: npx tsx scripts/purge-pre-b2-biblioteca.ts --execute");
    return;
  }

  if (ids.length === 0) {
    console.log("\nNada a apagar.");
    return;
  }

  console.log(`\nApagando ${ids.length} faixa(s)…`);
  const started = Date.now();
  const result = await deleteAllPreB2Musicas();
  const sec = Math.round((Date.now() - started) / 1000);
  const keepAfter = await countB2FullMusicas();

  console.log(`\nConcluído em ${sec}s`);
  console.log(`  deleted: ${result.deleted}`);
  console.log(`  failed:  ${result.failed}`);
  console.log(`  restantes B2 completo: ${keepAfter}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
