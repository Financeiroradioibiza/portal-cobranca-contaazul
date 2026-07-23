/**
 * Lista faixas da biblioteca com id (cuid) para audit / suporte.
 *
 * Requer DATABASE_URL em .env.local (mesmo do portal local / Neon).
 *
 *   npm run criacao:list-musicas
 *   npm run criacao:list-musicas -- --limit=20
 *   npm run criacao:list-musicas -- --q=artista ou trecho do título
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const repoRoot = path.resolve(__dirname);
for (const name of [".env.local", ".env"]) {
  const p = path.join(repoRoot, name);
  if (fs.existsSync(p)) loadEnvFile({ path: p });
}

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(`
Falta DATABASE_URL (Neon). Coloque em ${path.join(repoRoot, ".env.local")} — o mesmo do portal local.
`);
    process.exit(1);
  }

  const limit = Math.min(Math.max(Number(argValue("limit") ?? "15") || 15, 1), 100);
  const q = argValue("q")?.trim() ?? "";

  const { prisma } = await import("../lib/prisma");

  const rows = await prisma.musicaBiblioteca.findMany({
    where:
      q ?
        {
          OR: [
            { titulo: { contains: q, mode: "insensitive" } },
            { artista: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      titulo: true,
      artista: true,
      status: true,
      masterStorageKey: true,
      updatedAt: true,
      versoes: {
        where: { formato: "mp3_128_mono" },
        select: { storageKey: true },
        take: 1,
      },
    },
  });

  if (rows.length === 0) {
    console.log(q ? `Nenhuma faixa encontrada para --q=${q}` : "Biblioteca vazia.");
    return;
  }

  console.log(`Últimas ${rows.length} faixa(s)${q ? ` (busca: ${q})` : ""}:\n`);
  for (const m of rows) {
    const sk = m.versoes[0]?.storageKey ?? "—";
    const master =
      m.masterStorageKey?.startsWith("local:") ? "master:local"
      : m.masterStorageKey ? "master:B2"
      : "sem master";
    console.log(`${m.id}`);
    console.log(`  ${m.artista || "?"} — ${m.titulo || "(sem título)"}`);
    console.log(`  status=${m.status} · ${master} · uso=${sk.slice(0, 48)}${sk.length > 48 ? "…" : ""}`);
    console.log("");
  }

  console.log("Audit B2 (cloud2, precisa CRIACAO_INGEST_SECRET no .env.local):");
  console.log(`  npm run criacao:audit-b2 -- --musica=${rows[0]!.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect().catch(() => null);
  });
