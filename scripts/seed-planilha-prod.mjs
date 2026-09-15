#!/usr/bin/env node
/**
 * Importa a planilha ATLS Criação (.xlsx) para planilha_prod_* no banco.
 * Uso: node scripts/seed-planilha-prod.mjs "/caminho/ATLS PLANILHA CRIAÇÃO .xlsx"
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const xlsxPath = process.argv[2] ?? path.join(process.env.HOME ?? "", "Downloads", "ATLS PLANILHA CRIAÇÃO .xlsx");

if (!fs.existsSync(xlsxPath)) {
  console.error("Arquivo não encontrado:", xlsxPath);
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(root, "..", ".seed-planilha-prod.run.cjs");

execSync(
  `npx esbuild scripts/seed-planilha-prod-run.ts --bundle --platform=node --packages=external --format=cjs --tsconfig=tsconfig.json --log-level=warning --outfile=${runner}`,
  { stdio: "inherit", cwd: path.join(root, "..") },
);

execSync(`node ${runner} ${JSON.stringify(xlsxPath)}`, { stdio: "inherit", cwd: path.join(root, "..") });
