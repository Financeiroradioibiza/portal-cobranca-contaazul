/**
 * Aplica MARCA + PDVs a partir do CSV «planilha interna» contra o Postgres já configurado
 * (`DATABASE_URL` no `.env` ou variável exportada na shell).
 *
 * Isto não passa pela Netlify: não há limite HTTP de ~10s; uso típico após já existirem
 * linhas na competência (uuid CA + nome fantasia) por sync rápido ou CSV de clientes.
 *
 * Exemplos:
 *   npm run rio:apply-marca-layout -- 202611
 *   npm run rio:apply-marca-layout -- 202611 ./meu-arquivo.csv
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { applyMarcaPdvCsvLayoutToMonth } from "@/lib/rio/rioClienteCompService";

const DEFAULT_REL = path.join("data", "rio-marca-pdv-planilha-inicial.csv");

function parseYm(raw: string | undefined): number | null {
  if (!raw || !/^\d{6}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

async function main() {
  const ymArg = process.argv[2];
  const ym = parseYm(ymArg);
  if (!ym) {
    console.error(
      "Uso: npm run rio:apply-marca-layout -- YYYYMM [caminho-do-csv opcional]",
    );
    console.error(
      `  Ex.: npm run rio:apply-marca-layout -- ${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    );
    console.error(`  CSV por defeito: ${DEFAULT_REL}`);
    process.exit(1);
  }

  const durl = process.env.DATABASE_URL?.trim();
  if (!durl) {
    console.error(
      "Defina DATABASE_URL (ex.: copie «Pooled» do Neon para o `.env` deste projecto).",
    );
    process.exit(1);
  }

  const filePath = path.resolve(
    process.cwd(),
    process.argv[3] ?? DEFAULT_REL,
  );
  const base = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    console.error(`Ficheiro não encontrado: ${filePath}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(filePath);
  console.warn(`→ Competência ${ym} ← ${filePath} (${Math.round(buf.length / 1024)} KiB)`);

  const result = await applyMarcaPdvCsvLayoutToMonth(ym, buf, base);

  console.log(JSON.stringify({ appliedCount: result.appliedCount, unmatchedCount: result.unmatchedLabels.length }, null, 2));

  const w = result.warnings ?? [];
  if (w.length) {
    console.warn("Avisos (primeiros 40):");
    for (const line of w.slice(0, 40)) console.warn(`  • ${line}`);
    if (w.length > 40) console.warn(`  … (+${w.length - 40} mais)`);
  }

  const u = result.unmatchedLabels ?? [];
  if (u.length) {
    console.warn("Nomes do CSV não casaram com nome_fantasia (primeiros 50):");
    for (const n of u.slice(0, 50)) console.warn(`  − ${n}`);
    if (u.length > 50) console.warn(`  … (+${u.length - 50} mais)`);
  }

  console.warn("✓ Feito.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
