/**
 * Agrupa na produção (coluna direita) clientes Hering «de um ponto só»
 * Grupos na produção com 1 PDV (nome começa com HERING) → HERINGTODAS.
 *
 * Linhas Hering que já têm PDVs na Rio permanecem nos próprios buckets.
 *
 * Uso:
 *   npm run producao:group-hering -- 202605
 *   npm run producao:group-hering -- 202605 --dry-run
 */
import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function parseYm(argv: string[]): { ym: number; dryRun: boolean } {
  const pos = argv.filter((a) => !a.startsWith("--"));
  const dryRun = argv.includes("--dry-run");
  const ym = pos[0] ? Number(pos[0]) : NaN;
  if (!Number.isFinite(ym) || ym < 200001 || ym > 210012) {
    console.error("Uso: npm run producao:group-hering -- YYYYMM [--dry-run]");
    process.exit(1);
  }
  return { ym, dryRun };
}

async function main() {
  const { ym, dryRun } = parseYm(process.argv.slice(2));
  const { groupHeringSinglePointPdvs } = await import(
    "../lib/cadastros/producaoHeringGroupService"
  );

  if (dryRun) {
    console.log("--dry-run: use o botão na UI ou remova --dry-run para gravar.");
    process.exit(0);
  }

  const result = await groupHeringSinglePointPdvs(ym);
  console.log(`Competência ${result.yearMonth}`);
  console.log(`Grupo HERINGTODAS: ${result.heringGroupKey}`);
  console.log(`Movidas (${result.movedCount}):`);
  for (const n of result.movedNames) console.log(`  · ${n}`);
  if (result.skippedMultiPdv.length) {
    console.log(`\nMantidos (vários PDVs no grupo):`);
    for (const n of result.skippedMultiPdv) console.log(`  · ${n}`);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
