/**
 * Audita masters + versões 128 (b2:) no Backblaze via cloud2.
 *
 * Uso: npm run criacao:audit-b2
 *      npm run criacao:audit-b2 -- --limit=100
 *      npm run criacao:audit-b2 -- --musica=clxxxxxxxx
 *
 * Local: crie `.env.local` na raiz do repo com o MESMO secret do Netlify/cloud2:
 *   CRIACAO_INGEST_SECRET=...
 * Opcional: CRIACAO_CLOUD2_INGEST_URL=https://cloud2.radioibiza.app.br/criacao/ingest
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const repoRoot = path.resolve(__dirname);

for (const name of [".env.local", ".env"]) {
  const p = path.join(repoRoot, name);
  if (fs.existsSync(p)) loadEnvFile({ path: p });
}

if (!process.env.CRIACAO_INGEST_SECRET?.trim() && process.env.CLOUD2_INGEST_SECRET?.trim()) {
  process.env.CRIACAO_INGEST_SECRET = process.env.CLOUD2_INGEST_SECRET.trim();
}

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function printMissingSecretHelp(): void {
  const hasLocal = fs.existsSync(path.join(repoRoot, ".env.local"));
  const hasEnv = fs.existsSync(path.join(repoRoot, ".env"));
  console.error(`
Falta CRIACAO_INGEST_SECRET no ambiente local (arquivos lidos: .env.local=${hasLocal}, .env=${hasEnv}).

O audit chama o cloud2 com header x-criacao-secret — precisa da mesma chave do servidor:

  1. Netlify → Environment variables → CRIACAO_INGEST_SECRET
     ou Envyron → /opt/portal-ibiza/infra/.env (CRIACAO_INGEST_SECRET / CLOUD2_INGEST_SECRET)

  2. Crie ${path.join(repoRoot, ".env.local")}:

     CRIACAO_INGEST_SECRET=cole_aqui_sem_aspas_extras
     # opcional se o host for outro:
     # CRIACAO_CLOUD2_INGEST_URL=https://cloud2.radioibiza.app.br/criacao/ingest

  3. Rode de novo com o cuid real da faixa, ex.:
     npm run criacao:audit-b2 -- --musica=clxxxxxxxxxxxx
`);
}

async function main(): Promise<void> {
  const { cloud2Enabled, cloud2Fetch, CRIACAO_CLOUD2_BASE } = await import("../lib/criacao/cloud2Client");

  if (!cloud2Enabled()) {
    printMissingSecretHelp();
    process.exit(1);
  }

  const musicaId = argValue("musica");
  const limit = argValue("limit");

  if (musicaId === "ID_DA_FAIXA" || musicaId === "cuid_da_faixa") {
    console.error("Substitua --musica= pelo id real (cuid) da faixa em musica_biblioteca.");
    process.exit(1);
  }

  if (musicaId) {
    const path = `/ops/b2-verify/${encodeURIComponent(musicaId)}`;
    const res = await cloud2Fetch(path);
    const body = await res.json().catch(() => ({}));
    console.log(`GET ${CRIACAO_CLOUD2_BASE}${path} → HTTP ${res.status}`);
    if (res.status === 404) {
      console.error(
        "Rota não encontrada — publique o cloud2 com /criacao/ops/b2-verify (sync .cloud2-stage).",
      );
    }
    console.log(JSON.stringify(body, null, 2));
    process.exit(res.ok && body.ok === true ? 0 : 1);
  }

  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  const path = `/ops/b2-audit${qs}`;
  const res = await cloud2Fetch(path);
  const report = await res.json().catch(() => ({}));
  console.log(`GET ${CRIACAO_CLOUD2_BASE}${path} → HTTP ${res.status}`);
  if (res.status === 404) {
    console.error("Rota não encontrada — deploy cloud2 com ops/b2-audit.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(report);
    process.exit(1);
  }

  const m = report.masters;
  const u = report.uso128;
  console.log(
    [
      `B2 audit ${report.collectedAt}`,
      `bucket=${report.bucket}`,
      `masters: scanned=${m?.scanned} ok=${m?.ok} missing=${m?.missing?.length ?? 0} sizeMismatch=${m?.sizeMismatch?.length ?? 0}`,
      `uso128: scanned=${u?.scanned} ok=${u?.ok} missing=${u?.missing?.length ?? 0} sizeMismatch=${u?.sizeMismatch?.length ?? 0}`,
      `overall ok=${report.ok}`,
    ].join("\n"),
  );

  if (m?.missing?.length) {
    console.log("\nMasters ausentes (amostra):");
    for (const row of m.missing.slice(0, 20)) {
      console.log(`  ${row.musicaId} ${row.storageKey}`);
    }
  }
  if (u?.missing?.length) {
    console.log("\n128 B2 ausentes (amostra):");
    for (const row of u.missing.slice(0, 20)) {
      console.log(`  ${row.musicaId} ${row.storageKey}`);
    }
  }

  process.exit(report.ok === true ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
