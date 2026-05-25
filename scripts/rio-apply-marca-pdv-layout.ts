/**
 * Aplica MARCA + PDVs a partir do CSV «planilha interna» contra o Postgres já configurado
 * (`DATABASE_URL` no `.env` / `.env.local` ou na shell).
 *
 * Isto não passa pela Netlify: não há limite HTTP de ~10s; uso típico após já existirem
 * linhas na competência (uuid CA + nome fantasia) por sync rápido ou CSV de clientes.
 *
 * Exemplos:
 *   npm run rio:apply-marca-layout -- 202611
 *   npm run rio:apply-marca-layout -- 202611 ./meu-arquivo.csv
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** Antes do Prisma: variáveis têm de estar já em `process.env`. */
function loadCliEnv(): void {
  const root = process.cwd();
  dotenv.config({ path: path.join(root, ".env") });
  dotenv.config({ path: path.join(root, ".env.local") });
}

const DEFAULT_REL = path.join("data", "rio-marca-pdv-planilha-inicial.csv");

function parseYm(raw: string | undefined): number | null {
  if (!raw || !/^\d{6}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

async function main() {
  loadCliEnv();

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

  let durl = process.env.DATABASE_URL?.trim();
  /** Alguns setups deixam só `DATABASE_POOL_URL` (Neon pooled) no `.env.local`. */
  if (
    (!durl || /postgresql:\/\/[^\s:@]+@(localhost|127\.0\.0\.1)[:\/?]/i.test(durl)) &&
    process.env.DATABASE_POOL_URL?.trim()
  ) {
    durl = process.env.DATABASE_POOL_URL!.trim();
  }

  if (!durl || durl.includes("postgres://USERNAME") || /example\.invalid/i.test(durl)) {
    console.error(
      "Defina DATABASE_URL com a connection string (**Pooled**) do Neon (igual ao que tens na Netlify).",
    );
    console.error(
      "  Coloca-a em `.env.local` ou `.env` na raiz deste repo (.env primeiro; `.env.local` sobrepõe).",
    );
    console.error(
      "  Alternativa opcional para este comando: variável só pooled `DATABASE_POOL_URL=...` ",
    );
    process.exit(1);
  }

  if (/postgresql:\/\/[^\s:@]+@(localhost|127\.0\.0\.1)[:\/?]/i.test(durl)) {
    console.warn(
      "[aviso] DATABASE_URL aponta a localhost — se querias Neon, corrige `.env.local`/`DATABASE_URL`; local só se o Postgres aí existe.",
    );
  }

  process.env.DATABASE_URL = durl;

  const { applyMarcaPdvCsvLayoutToMonth } = await import("@/lib/rio/rioClienteCompService");

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
