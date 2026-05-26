/**
 * Aplica MARCA + PDVs a partir do CSV «planilha interna» contra o Postgres já configurado
 * (`DATABASE_URL` no `.env` / `.env.local`, na shell, ou opcionalmente `--database-url=`).
 *
 * Isto não passa pela Netlify: não há limite HTTP de ~10s; uso típico após já existirem
 * linhas na competência (uuid CA + nome fantasia) por sync rápido ou CSV de clientes.
 *
 * Exemplos:
 *   npm run rio:apply-marca-layout -- 202611
 *   npm run rio:apply-marca-layout -- --database-url="postgresql://...@....pooler.neon.tech/..." 202611
 *   npm run rio:apply-marca-layout -- --database-url-file=./neon-pooled.url 202611
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

/** Parse JDBC Postgres → URL (fallback `postgres://`). */
function pgUrlParsed(raw: string): URL | null {
  try {
    return new URL(raw.trim().replace(/^postgres:\/\//i, "postgresql://"));
  } catch {
    return null;
  }
}

/** Host JDBC para diagnóstico (sem passwords). */
function pgUrlHost(raw: string): string {
  const u = pgUrlParsed(raw);
  if (!u) return "(URL inválida)";
  return u.hostname || "(sem host)";
}

function isLocalPgHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1"
  );
}

function looksLocalDbUrl(raw: string): boolean {
  return isLocalPgHost(pgUrlHost(raw));
}

function looksInvalidDbPlaceholder(durl: string): boolean {
  return (
    !durl ||
    durl.includes("postgres://USERNAME") ||
    durl.includes("USER:PASSWORD@HOST") ||
    /example\.invalid/i.test(durl)
  );
}

type ParsedCli = {
  ym: number | null;
  csvPath: string | undefined;
  databaseUrlOverride: string | undefined;
};

/** Argumentos após `npm run … -- …` (process.argv.slice(2)). */
function parseArgv(argv: string[]): ParsedCli {
  const positionals: string[] = [];
  let databaseUrlOverride: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--database-url") {
      databaseUrlOverride = (argv[++i] ?? "").trim();
      continue;
    }
    if (a.startsWith("--database-url=")) {
      databaseUrlOverride = a.slice("--database-url=".length).trim();
      continue;
    }
    if (a === "--database-url-file") {
      const rel = (argv[++i] ?? "").trim();
      const p = path.resolve(process.cwd(), rel);
      if (!fs.existsSync(p)) {
        throw new Error(`Ficheiro não encontrado: ${p} (--database-url-file)`);
      }
      databaseUrlOverride = fs.readFileSync(p, "utf8").trim();
      continue;
    }
    if (a.startsWith("--database-url-file=")) {
      const rel = a.slice("--database-url-file=".length).trim();
      const p = path.resolve(process.cwd(), rel);
      if (!fs.existsSync(p)) {
        throw new Error(`Ficheiro não encontrado: ${p} (--database-url-file=…)`);
      }
      databaseUrlOverride = fs.readFileSync(p, "utf8").trim();
      continue;
    }
    positionals.push(a);
  }

  let ym: number | null = null;
  for (const p of positionals) {
    if (/^\d{6}$/.test(p)) {
      ym = Number(p);
      break;
    }
  }

  const ymStr = ym != null ? String(ym) : null;
  let csvPath: string | undefined;
  for (const p of positionals) {
    if (ymStr && p === ymStr) continue;
    csvPath = p;
    break;
  }

  return { ym, csvPath, databaseUrlOverride };
}

async function main() {
  loadCliEnv();

  const cli = parseArgv(process.argv.slice(2));
  const ym = cli.ym;
  if (!ym) {
    console.error(
      "Uso: npm run rio:apply-marca-layout -- YYYYMM [caminho-do-csv opcional]",
    );
    console.error(
      `  Ex.: npm run rio:apply-marca-layout -- ${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    );
    console.error(`  CSV por defeito: ${DEFAULT_REL}`);
    console.error(
      "  URL Neon (**pooled**) sem .env.local: `--database-url=…` ou `--database-url-file=./neon-url.txt`",
    );
    process.exit(1);
  }

  let durl = cli.databaseUrlOverride?.trim() || process.env.DATABASE_URL?.trim();

  /** Se `.env` ainda está com exemplo `localhost` ou vazio mas tens Neon noutra variável. */
  if (
    (!durl ||
      looksLocalDbUrl(durl)) &&
    process.env.DATABASE_POOL_URL?.trim()
  ) {
    durl = process.env.DATABASE_POOL_URL!.trim();
  }

  if (
    (!durl || looksInvalidDbPlaceholder(durl)) &&
    process.env.NEON_DATABASE_URL?.trim()
  ) {
    durl = process.env.NEON_DATABASE_URL!.trim();
  }

  if (!durl || looksInvalidDbPlaceholder(durl)) {
    console.error(
      "Sem URL de Postgres válida: copia **`DATABASE_URL` (pooled Neon)** da Netlify para `.env.local` na raiz do repo.",
    );
    console.error(
      "  Alternativas: `DATABASE_POOL_URL`, `NEON_DATABASE_URL` no `.env`, ou na linha de comando:",
    );
    console.error(
      `    npm run rio:apply-marca-layout -- --database-url="<COLA_AQUI_POOLER_NEON>" ${ym}`,
    );
    console.error(
      `    npm run rio:apply-marca-layout -- --database-url-file=./neon-url.txt ${ym}`,
    );
    console.error(
      '  Leram-se `.env` e depois `.env.local`; o segundo ganha.',
    );
    process.exit(1);
  }

  const parsedPg = pgUrlParsed(durl);
  if (!parsedPg) {
    console.error(`URL Postgres sintacticamente inválida (ver DATABASE_URL): «${pgUrlHost(durl)}».`);
    process.exit(1);
  }

  const hostResolved = parsedPg.hostname;
  if (
    isLocalPgHost(hostResolved) &&
    process.env.RIO_CLI_ALLOW_LOCAL_POSTGRES !== "1"
  ) {
    console.error(
      `[erro] A URL efectiva usa host «${hostResolved}» — isto está quase sempre errado quando queres atualizar Neon em produção.`,
    );
    console.error(
      "  Cole no `.env.local` uma linha: DATABASE_URL=\"postgresql://…@….pooler…neon.tech/neondb?sslmode=require\"",
    );
    console.error(
      '  Ou defina `DATABASE_POOL_URL=…` só com esse URL pooled.',
    );
    console.error(
      `  Ou sem editar .env: npm run rio:apply-marca-layout -- --database-url="<NEON pooled>" ${ym}`,
    );
    console.error(
      "  Postgres local mesmo? export RIO_CLI_ALLOW_LOCAL_POSTGRES=1 antes do comando.",
    );
    process.exit(1);
  }

  process.env.DATABASE_URL = durl;
  console.warn(`→ Postgres host: «${hostResolved}»`);

  const { applyMarcaPdvCsvLayoutToMonth } = await import("@/lib/rio/rioClienteCompService");

  const filePath = path.resolve(process.cwd(), cli.csvPath ?? DEFAULT_REL);
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
