#!/usr/bin/env node
/**
 * Netlify build: `prisma migrate deploy` com novas tentativas (Neon a acordar / rede intermitente).
 *
 * Emergência (só enquanto corrige DATABASE_URL):
 *   SKIP_PRISMA_MIGRATE=1
 *
 * Afinar:
 *   PRISMA_MIGRATE_ATTEMPTS=8
 *   PRISMA_MIGRATE_DELAY_MS=6000
 */
import { spawn } from "node:child_process";

if (process.env.SKIP_PRISMA_MIGRATE === "1") {
  console.log("[netlify-migrate] SKIP_PRISMA_MIGRATE=1 — a saltar prisma migrate deploy.");
  process.exit(0);
}

const attempts = Math.max(1, Number(process.env.PRISMA_MIGRATE_ATTEMPTS || 6));
const baseDelay = Math.max(2000, Number(process.env.PRISMA_MIGRATE_DELAY_MS || 5000));

function runMigrate() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  for (let i = 1; i <= attempts; i++) {
    console.log(`[netlify-migrate] tentativa ${i}/${attempts}: npx prisma migrate deploy`);
    const code = await runMigrate();
    if (code === 0) {
      console.log("[netlify-migrate] migrate deploy concluído.");
      process.exit(0);
    }
    if (i < attempts) {
      const wait = baseDelay * i;
      console.log(`[netlify-migrate] falhou (código ${code}). Aguardar ${wait} ms e repetir…`);
      await sleep(wait);
    }
  }
  console.error(
    `[netlify-migrate] Falha após ${attempts} tentativas (Prisma P1001 / Can't reach database).
→ Na Netlify, use o connection string **Pooled** do Neon + \`?sslmode=require\` (painel Neon → Connection string).
→ Desative bloqueio por IP no Neon, se existir.
→ Confirme que o branch não está em pausa.
→ Ou rode migrações localmente e use SKIP_PRISMA_MIGRATE=1 só temporariamente.`,
  );
  process.exit(1);
})();
