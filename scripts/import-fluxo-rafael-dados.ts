#!/usr/bin/env npx tsx
/**
 * Importa backup JSON do Fluxo Rafael para o Neon (PortalConfig).
 *
 *   npx tsx scripts/import-fluxo-rafael-dados.ts "/caminho/dados-backup.json"
 *   npx tsx scripts/import-fluxo-rafael-dados.ts --force "/caminho/dados-backup.json"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FLUXO_RAFAEL_CONFIG_KEY,
  getFluxoRafaelDados,
  setFluxoRafaelDados,
  type FluxoRafaelDados,
} from "../lib/financeiro/fluxoRafaelService";

const force = process.argv.includes("--force");
const fileArg = process.argv.find((a) => !a.startsWith("-") && a.endsWith(".json"));

async function main() {
  if (!fileArg) {
    console.error("Uso: npx tsx scripts/import-fluxo-rafael-dados.ts [--force] <caminho.json>");
    process.exit(1);
  }

  const filePath = resolve(fileArg);
  const raw = readFileSync(filePath, "utf8");
  const dados = JSON.parse(raw) as FluxoRafaelDados;

  const existing = await getFluxoRafaelDados();
  if (existing && Object.keys(existing).length > 0 && !force) {
    console.error(
      `Já existem dados em ${FLUXO_RAFAEL_CONFIG_KEY}. Use --force para sobrescrever.`,
    );
    process.exit(1);
  }

  await setFluxoRafaelDados(dados, "import-fluxo-rafael-dados");
  console.log(`Importado de ${filePath} → ${FLUXO_RAFAEL_CONFIG_KEY}`);
  console.log(
    `  previstos: ${dados.previstos?.length ?? 0}, meses lanc: ${Object.keys(dados.lanc ?? {}).length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
